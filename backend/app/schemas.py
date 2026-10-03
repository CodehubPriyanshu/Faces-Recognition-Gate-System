import math
import re
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from .security import js_length, js_number


def string_value(value, minimum=0, maximum=500, trim=True):
    if not isinstance(value, str):
        raise ValueError("Expected string")
    value = value.strip() if trim else value
    if not minimum <= js_length(value) <= maximum:
        raise ValueError(f"String must contain {minimum}-{maximum} characters")
    return value


def text(minimum=0, maximum=500, trim=True):
    return Annotated[str, BeforeValidator(lambda value: string_value(value, minimum, maximum, trim))]


def email(value):
    value = string_value(value, 1, 255)
    if not re.fullmatch(r"(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+\-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}", value, re.I | re.ASCII):
        raise ValueError("Invalid email")
    return value.lower()


def password(value):
    value = string_value(value, 8, 128, trim=False)
    if not re.search(r"[A-Z]", value):
        raise ValueError("Need an uppercase letter")
    if not re.search(r"[0-9]", value):
        raise ValueError("Need a number")
    return value


def visitor_count(value):
    number = js_number(value)
    if not math.isfinite(number) or number != int(number) or not 1 <= number <= 1000:
        raise ValueError("Visitor count must be an integer from 1 to 1000")
    return int(number)


def confidence(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not 0 <= value <= 1:
        raise ValueError("Confidence must be a number from 0 to 1")
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Login(StrictModel):
    email: Annotated[str, BeforeValidator(email)]
    password: text(1, 128, trim=False)


class User(StrictModel):
    email: Annotated[str, BeforeValidator(email)]
    full_name: text(1, 120)
    role: Literal["admin", "security_guard", "gate_operator"]
    password: Annotated[str, BeforeValidator(password)]


class Password(StrictModel):
    password: Annotated[str, BeforeValidator(password)]


class Visitor(StrictModel):
    full_name: text(1, 120)
    mobile: text(5, 30)
    id_type: text(1, 50)
    id_number: text() | None = None
    purpose: text(1, 100)
    whom_to_meet: text() | None = None
    vehicle_number: text() | None = None
    visitor_count: Annotated[int, BeforeValidator(visitor_count)]
    in_charge_name: text() | None = None
    remarks: text() | None = None
    photo: text(0, 3 * 1024 * 1024, trim=False)
    signature: text(0, 3 * 1024 * 1024, trim=False)


class Exit(StrictModel):
    confidence: Annotated[float, BeforeValidator(confidence)]
