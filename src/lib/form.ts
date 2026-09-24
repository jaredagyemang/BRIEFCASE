// Helpers shared by the add/edit forms' Server Actions.

export type FormState =
  | {
      error: string;
      fieldErrors?: Record<string, string>;
      // Echoed back so the form keeps what was typed after React resets it.
      values: Record<string, string>;
    }
  | undefined;

export function submittedValues(formData: FormData) {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  });
  return values;
}

// A trimmed text field, or null when left blank.
export function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value === "" ? null : value;
}

export function isEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

// Standard "fix the highlighted fields" response.
export function invalid(fieldErrors: Record<string, string>, formData: FormData): FormState {
  return { error: "Please fix the highlighted fields.", fieldErrors, values: submittedValues(formData) };
}
