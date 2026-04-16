export function validatePassword(pw: string): void {
  const s = pw.trim();
  if (s.length < 8 || s.length > 32) throw new Error("密码长度需为 8~32 位");
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const hasDigit = /[0-9]/.test(s);
  const hasSpecial = /[~!@#$%^*\-_=+?,()&]/.test(s);
  const cats = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
    Boolean,
  ).length;
  if (cats < 3)
    throw new Error(
      "密码需至少包含以下字符中的三种：大小写字母、数字、特殊符号",
    );
}