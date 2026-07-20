import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  DoorOpen,
  RefreshCw,
  ScanFace,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { recordAudit } from "@/lib/audit";
import { PageHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/exit")({
  head: () => ({ meta: [{ title: "Gate Exit Verification - BSF STC" }] }),
  component: ExitPage,
});

const FACE_MATCH_THRESHOLD = 0.78;
const SCAN_INTERVAL_MS = 1250;
const SCAN_TIMEOUT_MS = 30000;
const EMBEDDING_SIZE = 32;
const SAMPLE_STEP = 2;

type ScanState =
  | "idle"
  | "camera-ready"
  | "scanning"
  | "processing"
  | "verified"
  | "no-match"
  | "camera-error"
  | "empty"
  | "error";

interface Visitor {
  id: string;
  pass_no: string;
  full_name: string;
  mobile: string;
  purpose: string;
  whom_to_meet: string | null;
  vehicle_number: string | null;
  entry_time: string;
  exit_time: string | null;
  photo_url: string | null;
  status: string;
}

interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisitorEmbedding {
  visitor: Visitor;
  embedding: Float32Array;
}

interface MatchResult {
  visitor: Visitor;
  confidence: number;
  runnerUpConfidence: number;
}

type BrowserFaceDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

declare global {
  interface Window {
    FaceDetector?: new (options?: {
      fastMode?: boolean;
      maxDetectedFaces?: number;
    }) => BrowserFaceDetector;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeVector(values: number[]) {
  const length = Math.hypot(...values) || 1;
  return new Float32Array(values.map((value) => value / length));
}

function cosineSimilarity(a: Float32Array, b: Float32Array) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return clamp((dot + 1) / 2, 0, 1);
}

function imageDataEmbedding(imageData: ImageData) {
  const { data, width, height } = imageData;
  const features: number[] = [];

  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const index = (y * width + x) * 4;
      const r = data[index] / 255;
      const g = data[index + 1] / 255;
      const b = data[index + 2] / 255;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const warmth = (r - b + 1) / 2;
      features.push(luminance, warmth);
    }
  }

  const histogram = new Array(24).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = Math.floor(((0.299 * r + 0.587 * g + 0.114 * b) / 256) * 8);
    histogram[clamp(luminance, 0, 7)] += 1;
    histogram[8 + clamp(Math.floor((r / 256) * 8), 0, 7)] += 1;
    histogram[16 + clamp(Math.floor((b / 256) * 8), 0, 7)] += 1;
  }

  features.push(...histogram.map((value) => value / (width * height)));
  return normalizeVector(features);
}

function getFaceDetector() {
  if (typeof window === "undefined" || !window.FaceDetector) return null;
  try {
    return new window.FaceDetector({ fastMode: true, maxDetectedFaces: 4 });
  } catch {
    return null;
  }
}

async function detectFaces(source: CanvasImageSource): Promise<FaceBox[]> {
  const detector = getFaceDetector();
  if (!detector) return [];

  const faces = await detector.detect(source);
  return faces.map((face) => ({
    x: face.boundingBox.x,
    y: face.boundingBox.y,
    width: face.boundingBox.width,
    height: face.boundingBox.height,
  }));
}

function cropEmbedding(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  face?: FaceBox,
) {
  const canvas = document.createElement("canvas");
  canvas.width = EMBEDDING_SIZE;
  canvas.height = EMBEDDING_SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to initialize image scanner");

  const fallbackSize = Math.min(sourceWidth, sourceHeight) * 0.72;
  const fallbackX = (sourceWidth - fallbackSize) / 2;
  const fallbackY = (sourceHeight - fallbackSize) / 2;

  const box = face
    ? {
        x: clamp(face.x - face.width * 0.18, 0, sourceWidth),
        y: clamp(face.y - face.height * 0.25, 0, sourceHeight),
        width: clamp(face.width * 1.36, 1, sourceWidth),
        height: clamp(face.height * 1.48, 1, sourceHeight),
      }
    : { x: fallbackX, y: fallbackY, width: fallbackSize, height: fallbackSize };

  ctx.filter = "grayscale(20%) contrast(118%) brightness(105%)";
  ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, EMBEDDING_SIZE, EMBEDDING_SIZE);
  return imageDataEmbedding(ctx.getImageData(0, 0, EMBEDDING_SIZE, EMBEDDING_SIZE));
}

async function imageUrlToEmbedding(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Stored visitor image is unreadable"));
    image.src = url;
  });

  const faces = await detectFaces(image);
  if (faces.length > 1) throw new Error("Stored visitor image contains multiple faces");
  return cropEmbedding(image, image.naturalWidth, image.naturalHeight, faces[0]);
}

function captureVideoFrame(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to capture camera frame");

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function findBestMatch(probe: Float32Array, candidates: VisitorEmbedding[]): MatchResult | null {
  const ranked = candidates
    .map((candidate) => ({
      visitor: candidate.visitor,
      confidence: cosineSimilarity(probe, candidate.embedding),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];
  if (!best) return null;

  return {
    ...best,
    runnerUpConfidence: ranked[1]?.confidence ?? 0,
  };
}

function statusCopy(state: ScanState, cameraDenied: boolean, faceDetectorReady: boolean) {
  if (cameraDenied) return "Camera permission denied";
  if (state === "verified") return "Identity Verified";
  if (state === "no-match") return "Face Not Matched";
  if (state === "processing") return "Comparing biometric pattern...";
  if (state === "scanning") return "Scanning Face...";
  if (state === "empty") return "No Active Visitor Found";
  if (state === "camera-error") return "Camera reconnect required";
  if (!faceDetectorReady) return "Scanner ready - face detector fallback active";
  return "Awaiting Visitor";
}

function confidenceLabel(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

function ExitPage() {
  const auth = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef(false);
  const scanStartedAtRef = useRef<number | null>(null);
  const embeddingCacheRef = useRef(new Map<string, VisitorEmbedding>());

  const [active, setActive] = useState<Visitor[]>([]);
  const [embeddings, setEmbeddings] = useState<VisitorEmbedding[]>([]);
  const [embeddingErrorCount, setEmbeddingErrorCount] = useState(0);
  const [search, setSearch] = useState("");
  const [matched, setMatched] = useState<MatchResult | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [message, setMessage] = useState("Awaiting Visitor");
  const [cameraDenied, setCameraDenied] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [lastConfidence, setLastConfidence] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const faceDetectorReady = useMemo(
    () => typeof window !== "undefined" && !!window.FaceDetector,
    [],
  );

  const loadVisitors = useCallback(async () => {
    const { data, error } = await supabase
      .from("visitors")
      .select("*")
      .eq("status", "in_campus")
      .is("exit_time", null)
      .not("photo_url", "is", null)
      .order("entry_time", { ascending: false });

    if (error) {
      setScanState("error");
      setMessage(error.message);
      return;
    }

    const visitors = ((data ?? []) as Visitor[]).filter((visitor) => Boolean(visitor.photo_url));
    setActive(visitors);
    if (visitors.length === 0) {
      setEmbeddings([]);
      setScanState("empty");
      setMessage("No Active Visitor Found");
    }
  }, []);

  const buildEmbeddings = useCallback(async (visitors: Visitor[]) => {
    const prepared: VisitorEmbedding[] = [];
    let failures = 0;

    await Promise.all(
      visitors.map(async (visitor) => {
        if (!visitor.photo_url) return;

        const cached = embeddingCacheRef.current.get(visitor.id);
        if (cached && cached.visitor.photo_url === visitor.photo_url) {
          prepared.push(cached);
          return;
        }

        try {
          const embedding = await imageUrlToEmbedding(visitor.photo_url);
          const item = { visitor, embedding };
          embeddingCacheRef.current.set(visitor.id, item);
          prepared.push(item);
        } catch {
          failures += 1;
        }
      }),
    );

    const activeIds = new Set(visitors.map((visitor) => visitor.id));
    for (const id of embeddingCacheRef.current.keys()) {
      if (!activeIds.has(id)) embeddingCacheRef.current.delete(id);
    }

    setEmbeddingErrorCount(failures);
    setEmbeddings(prepared);

    if (visitors.length > 0 && prepared.length === 0) {
      setScanState("error");
      setMessage("Stored visitor images could not be processed");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraDenied(false);
    setMessage("Connecting camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScanState((state) => (state === "empty" ? "empty" : "camera-ready"));
      setMessage("Awaiting Visitor");
    } catch (error) {
      setCameraDenied(true);
      setScanState("camera-error");
      setMessage(error instanceof Error ? error.message : "Camera permission denied");
    }
  }, [stopCamera]);

  const resetScan = useCallback(() => {
    scanStartedAtRef.current = Date.now();
    setMatched(null);
    setFaceBox(null);
    setLastConfidence(0);
    setScanState(active.length === 0 ? "empty" : "scanning");
    setMessage(active.length === 0 ? "No Active Visitor Found" : "Scanning Face...");
  }, [active.length]);

  const scanFrame = useCallback(async () => {
    if (scanLockRef.current || matched || cameraDenied) return;
    if (active.length === 0 || embeddings.length === 0) return;

    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth)
      return;

    if (scanStartedAtRef.current && Date.now() - scanStartedAtRef.current > SCAN_TIMEOUT_MS) {
      setScanState("no-match");
      setMessage("Scan timeout. Please Retry Scan");
      return;
    }

    scanLockRef.current = true;
    setScanState("processing");

    try {
      const frame = captureVideoFrame(video);
      const faces = await detectFaces(frame);

      if (faces.length > 1) {
        setFaceBox(null);
        setScanState("error");
        setMessage("Multiple faces detected. Scan one visitor only");
        return;
      }

      if (faceDetectorReady && faces.length === 0) {
        setFaceBox(null);
        setScanState("scanning");
        setMessage("No face detected");
        return;
      }

      const detectedFace = faces[0] ?? null;
      setFaceBox(detectedFace);

      const probe = cropEmbedding(frame, frame.width, frame.height, detectedFace ?? undefined);
      const best = findBestMatch(probe, embeddings);
      const confidence = best?.confidence ?? 0;
      setLastConfidence(confidence);

      const runnerUpGap = confidence - (best?.runnerUpConfidence ?? 0);
      const accepted = Boolean(best && confidence >= FACE_MATCH_THRESHOLD && runnerUpGap >= 0.015);

      if (accepted && best) {
        setMatched(best);
        setScanState("verified");
        setMessage("Identity Verified");
        toast.success(`Identity verified: ${best.visitor.full_name}`);
        return;
      }

      setMatched(null);
      setScanState("no-match");
      setMessage("Face Not Matched - Please Retry Scan");
    } catch (error) {
      setScanState("error");
      setMessage(error instanceof Error ? error.message : "Face scan failed");
    } finally {
      scanLockRef.current = false;
    }
  }, [active.length, cameraDenied, embeddings, faceDetectorReady, matched]);

  useEffect(() => {
    loadVisitors();
    startCamera();

    const channel = supabase
      .channel("exit-vis")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitors" }, loadVisitors)
      .subscribe();

    return () => {
      stopCamera();
      supabase.removeChannel(channel);
    };
  }, [loadVisitors, startCamera, stopCamera]);

  useEffect(() => {
    buildEmbeddings(active);
  }, [active, buildEmbeddings]);

  useEffect(() => {
    if (active.length > 0 && embeddings.length > 0 && !matched && !cameraDenied) resetScan();
  }, [active.length, cameraDenied, embeddings.length, matched, resetScan]);

  useEffect(() => {
    if (!["scanning", "processing", "no-match", "camera-ready"].includes(scanState)) return;
    const interval = window.setInterval(scanFrame, SCAN_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [scanFrame, scanState]);

  const filtered = active.filter((visitor) => {
    const q = search.toLowerCase();
    return (
      !q ||
      visitor.full_name.toLowerCase().includes(q) ||
      visitor.pass_no.toLowerCase().includes(q) ||
      visitor.mobile.includes(q)
    );
  });

  const confirmExit = async () => {
    if (!matched || !auth.user || !auth.profile || !auth.role) return;
    setConfirming(true);

    const verificationMethod = "ai_face";
    const { visitor, confidence } = matched;
    const { error } = await supabase
      .from("visitors")
      .update({
        status: "exited",
        exit_time: new Date().toISOString(),
        exit_by: auth.user.id,
        exit_method: verificationMethod,
        exit_confidence: confidence,
      })
      .eq("id", visitor.id)
      .eq("status", "in_campus")
      .is("exit_time", null);

    if (error) {
      setConfirming(false);
      toast.error(error.message);
      return;
    }

    await recordAudit(
      { id: auth.user.id, email: auth.profile.email, role: auth.role },
      "visitor.exit",
      visitor.pass_no,
      {
        method: verificationMethod,
        confidence,
        visitor_id: visitor.id,
      },
    );

    toast.success(`${visitor.full_name} exited with AI face verification`);
    setConfirming(false);
    setMatched(null);
    setLastConfidence(0);
    await loadVisitors();
  };

  const scannerTone =
    scanState === "verified"
      ? "border-success/70 shadow-[0_0_28px_oklch(0.78_0.18_155_/_0.18)]"
      : scanState === "no-match" || scanState === "error" || scanState === "camera-error"
        ? "border-destructive/70 shadow-[0_0_28px_oklch(0.65_0.22_25_/_0.14)]"
        : "border-primary/60 shadow-[0_0_28px_oklch(0.79_0.16_75_/_0.12)]";

  return (
    <div>
      <PageHeader
        eyebrow="Gate Exit / AI Verification"
        title="AI Face Recognition Checkpoint"
        subtitle="Live camera verification against active in-campus visitor records"
        right={
          <div className="panel-inset px-3 py-2 font-mono text-[0.72rem] uppercase tracking-wider">
            <span className="text-primary">{embeddings.length}</span> Scan Ready
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3 panel p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="mono-label">Real-Time Face Scanner</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span className={`status-dot ${scanState === "verified" ? "" : "opacity-60"}`} />
                {statusCopy(scanState, cameraDenied, faceDetectorReady)}
              </div>
            </div>
            <button
              onClick={startCamera}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-[0.72rem] uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
            </button>
          </div>

          <div
            className={`relative overflow-hidden rounded-md border bg-black aspect-[16/10] ${scannerTone}`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0,oklch(0.79_0.16_75_/_0.08)_50%,transparent_100%)] opacity-30" />
            <div className="absolute inset-6 rounded-md border border-primary/25" />
            <div className="absolute left-8 right-8 top-1/2 h-px bg-primary/35" />
            <div className="absolute bottom-8 top-8 left-1/2 w-px bg-primary/35" />

            {["scanning", "processing", "no-match"].includes(scanState) && (
              <div className="scan-line" />
            )}

            {faceBox && (
              <div
                className="absolute border-2 border-success rounded-md shadow-[0_0_22px_oklch(0.78_0.18_155_/_0.4)] transition-all duration-300"
                style={{
                  left: `${100 - ((faceBox.x + faceBox.width) / (videoRef.current?.videoWidth || 1)) * 100}%`,
                  top: `${(faceBox.y / (videoRef.current?.videoHeight || 1)) * 100}%`,
                  width: `${(faceBox.width / (videoRef.current?.videoWidth || 1)) * 100}%`,
                  height: `${(faceBox.height / (videoRef.current?.videoHeight || 1)) * 100}%`,
                }}
              />
            )}

            <div className="absolute inset-x-4 bottom-4 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="panel-inset px-3 py-2">
                <div className="mono-label !text-[0.58rem]">Scanner State</div>
                <div className="font-mono text-xs text-primary uppercase mt-1">{message}</div>
              </div>
              <div className="panel-inset px-3 py-2">
                <div className="mono-label !text-[0.58rem]">Confidence</div>
                <div className="font-display text-lg font-bold text-foreground">
                  {confidenceLabel(lastConfidence)}
                </div>
              </div>
              <div className="panel-inset px-3 py-2">
                <div className="mono-label !text-[0.58rem]">Threshold</div>
                <div className="font-display text-lg font-bold text-primary">
                  {confidenceLabel(FACE_MATCH_THRESHOLD)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={resetScan}
              disabled={active.length === 0 || embeddings.length === 0}
              className="flex items-center justify-center gap-2 rounded-md bg-primary py-3 font-mono text-xs uppercase tracking-wider text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <ScanFace className="w-4 h-4" /> Retry Scan
            </button>
            <div className="panel-inset px-3 py-2">
              <div className="mono-label !text-[0.58rem]">Active With Face</div>
              <div className="font-display text-lg font-bold">{active.length}</div>
            </div>
            <div className="panel-inset px-3 py-2">
              <div className="mono-label !text-[0.58rem]">Image Errors</div>
              <div className="font-display text-lg font-bold text-warning">
                {embeddingErrorCount}
              </div>
            </div>
          </div>

          {(scanState === "no-match" ||
            scanState === "empty" ||
            scanState === "error" ||
            cameraDenied) &&
            !matched && (
              <div className="mt-5 rounded-md border border-destructive/50 bg-destructive/10 p-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                  <div>
                    <div className="font-display font-bold text-destructive">
                      {scanState === "empty" ? "No Active Visitor Found" : "Face Not Matched"}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {message ||
                        "Please Retry Scan. Exit action is locked until identity is verified."}
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>

        <div className="xl:col-span-2 space-y-5">
          {matched ? (
            <div className="panel p-5 border-success/60 shadow-[0_0_30px_oklch(0.78_0.18_155_/_0.13)] animate-in fade-in slide-in-from-right-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="mono-label">Verified Visitor</div>
                  <div className="mt-1 flex items-center gap-2 text-success font-mono text-xs uppercase tracking-wider">
                    <CheckCircle2 className="h-4 w-4" /> Identity Verified
                  </div>
                </div>
                <div className="rounded-md border border-success/50 bg-success/10 px-3 py-1.5 font-display text-xl font-bold text-success">
                  {confidenceLabel(matched.confidence)}
                </div>
              </div>

              <div className="mt-5 flex gap-4">
                {matched.visitor.photo_url ? (
                  <img
                    src={matched.visitor.photo_url}
                    className="h-24 w-24 rounded-md border border-success/60 object-cover"
                    alt={matched.visitor.full_name}
                  />
                ) : (
                  <div className="h-24 w-24 rounded-md border border-success/60 bg-muted flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8 text-success" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-display text-xl font-bold truncate">
                    {matched.visitor.full_name}
                  </div>
                  <div className="font-mono text-xs text-primary mt-1">
                    {matched.visitor.pass_no}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground mt-1">
                    {matched.visitor.mobile}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Info label="Purpose" value={matched.visitor.purpose} />
                <Info label="Vehicle" value={matched.visitor.vehicle_number ?? "-"} />
                <Info
                  label="Entry Time"
                  value={new Date(matched.visitor.entry_time).toLocaleString("en-GB")}
                />
                <Info label="Status" value={matched.visitor.status.replace("_", " ")} success />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={confirmExit}
                  disabled={confirming}
                  className="flex items-center justify-center gap-2 rounded-md bg-success py-3 font-mono text-xs uppercase tracking-wider text-background transition hover:opacity-90 disabled:opacity-50"
                >
                  <DoorOpen className="h-4 w-4" /> {confirming ? "Saving..." : "Confirm Exit"}
                </button>
                <button
                  onClick={resetScan}
                  className="flex items-center justify-center gap-2 rounded-md border border-border py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground transition hover:border-primary/50 hover:text-primary"
                >
                  <XCircle className="h-4 w-4" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="panel p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
                  <Camera className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-display font-bold">Awaiting Visitor</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    Verified details appear only after a valid match.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="panel p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="mono-label">Active Visitor Queue</div>
              <div className="panel-inset px-3 py-1.5 flex items-center gap-2 w-56">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  className="bg-transparent outline-none flex-1 font-mono text-xs min-w-0"
                  placeholder="Search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {filtered.map((visitor) => (
                <div key={visitor.id} className="panel-inset p-3 flex items-center gap-3">
                  {visitor.photo_url ? (
                    <img
                      src={visitor.photo_url}
                      className="h-12 w-12 rounded-md object-cover border border-border"
                      alt={visitor.full_name}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center font-display font-bold text-primary">
                      {visitor.full_name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{visitor.full_name}</div>
                    <div className="font-mono text-[0.7rem] text-muted-foreground truncate">
                      {visitor.pass_no} - {visitor.purpose}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[0.68rem] text-muted-foreground">
                    IN {new Date(visitor.entry_time).toLocaleTimeString("en-GB").slice(0, 5)}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-10 font-mono text-sm text-muted-foreground">
                  No active visitor with stored face image
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="panel-inset p-3">
      <div className="mono-label !text-[0.58rem]">{label}</div>
      <div
        className={`mt-1 truncate font-mono text-xs uppercase ${success ? "text-success" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
