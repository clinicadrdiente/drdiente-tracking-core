const NON_DIGIT_REGEX = /\D+/g;

export function normalizePhone(phone: string): string {
  return phone.replace(NON_DIGIT_REGEX, "");
}

export function normalizeEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  return email.trim().toLowerCase();
}
