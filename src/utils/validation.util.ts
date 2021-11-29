export function validateEmail(email: string): boolean {
  // eslint-disable-next-line max-len
  const emailRegex = /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

  if (!email) return false;

  const emailParts: string[] = email.split('@');

  if (emailParts.length !== 2) return false;

  const account: string = emailParts[0];
  const address: string = emailParts[1];

  if (account.length > 64) return false;
  if (address.length > 255) return false;

  const domainParts = address.split('.');
  if (domainParts.some((part) => part.length > 63)) return false;

  return emailRegex.test(email);
}

export function validatePassword(password: string): boolean {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d#$@!%&*?]{8,}$/;
  if (!password) return false;
  return passwordRegex.test(password);
}

export function trimToSingleSpace(str: string): string {
  return str.trim().replace(/\s\s+/g, ' ');
}

export function validateName(name: string): boolean {
  const nameRegex = /[$&+,:;=?@#|'<>.^*()%!-]/;
  return (name.length <= 100) && !nameRegex.test(name);
}

export function validateAvatar(avatar: File): boolean {
  const fileFormat: string = avatar.type.split('/').pop().toLowerCase();
  return ['jpeg', 'jpg', 'png'].includes(fileFormat) && avatar.size <= 2048000;
}

export function validateMinLength(min: number): (str: string) => boolean {
  return (str: string): boolean => (str.length >= min);
}
