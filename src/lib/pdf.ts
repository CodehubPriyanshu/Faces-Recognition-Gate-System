import jsPDF from "jspdf";
import QRCode from "qrcode";

export interface PassData {
  pass_no: string;
  full_name: string;
  mobile: string;
  id_type?: string | null;
  id_number?: string | null;
  purpose: string;
  whom_to_meet?: string | null;
  vehicle_number?: string | null;
  visitor_count: number;
  entry_time: string;
  in_charge_name?: string | null;
  photo_url?: string | null;
}

async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateGatePassPdf(p: PassData): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: [420, 600] });
  const W = 420;

  // background
  doc.setFillColor(22, 22, 22);
  doc.rect(0, 0, W, 600, "F");

  // header band
  doc.setFillColor(212, 161, 50);
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor(22, 22, 22);
  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text("BSF · STC BENGALURU", 24, 32);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("BORDER SECURITY FORCE · SUB-TRAINING CENTRE", 24, 48);
  doc.setFontSize(8);
  doc.text("OFFICIAL VISITOR GATE PASS", 24, 60);

  // pass number
  doc.setFillColor(30, 30, 30);
  doc.rect(20, 90, W - 40, 36, "F");
  doc.setDrawColor(212, 161, 50);
  doc.rect(20, 90, W - 40, 36);
  doc.setTextColor(180, 180, 180).setFontSize(8);
  doc.text("PASS NO", 28, 104);
  doc.setTextColor(212, 161, 50).setFont("helvetica", "bold").setFontSize(14);
  doc.text(p.pass_no, 28, 119);

  // photo + qr
  const photoX = 20, photoY = 140, photoW = 140, photoH = 160;
  doc.setFillColor(30, 30, 30);
  doc.rect(photoX, photoY, photoW, photoH, "F");
  if (p.photo_url) {
    const dataUrl = await imageToDataUrl(p.photo_url);
    if (dataUrl) {
      try { doc.addImage(dataUrl, "JPEG", photoX + 2, photoY + 2, photoW - 4, photoH - 4); } catch { /* ignore */ }
    }
  }

  // QR
  const qrData = await QRCode.toDataURL(p.pass_no, { margin: 1, color: { dark: "#000000", light: "#D4A132" } });
  doc.addImage(qrData, "PNG", W - 120, photoY, 100, 100);
  doc.setTextColor(180, 180, 180).setFontSize(7).setFont("helvetica", "normal");
  doc.text("SCAN AT GATE", W - 110, photoY + 112);

  // details
  let y = 320;
  const row = (label: string, value: string) => {
    doc.setTextColor(140, 140, 140).setFont("helvetica", "normal").setFontSize(8);
    doc.text(label.toUpperCase(), 24, y);
    doc.setTextColor(240, 240, 240).setFont("helvetica", "bold").setFontSize(11);
    doc.text(value || "—", 24, y + 13);
    y += 32;
  };
  row("Visitor", p.full_name);
  row("Mobile", p.mobile);
  row("Purpose", p.purpose);
  row("Whom to meet", p.whom_to_meet ?? "—");
  row("Vehicle", p.vehicle_number ?? "—");
  row("Entry", new Date(p.entry_time).toLocaleString());

  // footer band
  doc.setFillColor(212, 161, 50);
  doc.rect(0, 570, W, 30, "F");
  doc.setTextColor(22, 22, 22).setFont("helvetica", "bold").setFontSize(9);
  doc.text(`AUTHORISED BY: ${(p.in_charge_name ?? "").toUpperCase()}`, 20, 589);
  doc.text("CLASSIFIED · DO NOT DUPLICATE", W - 180, 589);

  doc.save(`gate-pass-${p.pass_no}.pdf`);
}
