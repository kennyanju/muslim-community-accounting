/**
 * Centralized Schema & Input Validation
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate Transaction creation payload
 */
export function validateTransactionPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid transaction payload object.');
  }

  const { type, totalAmount, splits, method, date } = data;

  if (!type || !['INCOME', 'EXPENSE'].includes(type.toUpperCase())) {
    throw new ValidationError("Transaction type must be either 'INCOME' or 'EXPENSE'.", 'type');
  }

  const numericTotal = parseFloat(totalAmount);
  if (isNaN(numericTotal) || numericTotal <= 0) {
    throw new ValidationError('Total amount must be a positive number greater than zero.', 'totalAmount');
  }

  if (!splits || !Array.isArray(splits) || splits.length === 0) {
    throw new ValidationError('At least one fund split allocation is required.', 'splits');
  }

  // Validate each split
  let splitSumCents = 0;
  for (let i = 0; i < splits.length; i++) {
    const s = splits[i];
    if (!s.fund_id) {
      throw new ValidationError(`Split #${i + 1} is missing a valid fund ID.`, `splits[${i}].fund_id`);
    }
    const splitAmt = parseFloat(s.amount);
    if (isNaN(splitAmt) || splitAmt <= 0) {
      throw new ValidationError(`Split #${i + 1} must have an amount greater than zero.`, `splits[${i}].amount`);
    }
    splitSumCents += Math.round(splitAmt * 100);
  }

  const totalCents = Math.round(numericTotal * 100);
  if (splitSumCents !== totalCents) {
    throw new ValidationError(
      `Splits total (£${(splitSumCents / 100).toFixed(2)}) does not equal transaction total (£${(totalCents / 100).toFixed(2)}).`,
      'splits'
    );
  }

  if (date && isNaN(new Date(date).getTime())) {
    throw new ValidationError('Transaction date must be a valid date.', 'date');
  }

  return true;
}

/**
 * Validate Donor registration payload
 */
export function validateDonorPayload(data) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid donor payload object.');
  }

  const { name, email, giftAidEligible, address_line_1, postcode } = data;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Donor full name is required.', 'name');
  }

  if (email && typeof email === 'string' && email.trim()) {
    if (!EMAIL_REGEX.test(email.trim())) {
      throw new ValidationError('Please provide a valid email address.', 'email');
    }
  }

  if (giftAidEligible) {
    if (!address_line_1 || !address_line_1.trim()) {
      throw new ValidationError('Address line 1 is mandatory for UK HMRC Gift Aid declarations.', 'address_line_1');
    }
    if (!postcode || !postcode.trim()) {
      throw new ValidationError('Postcode is mandatory for UK HMRC Gift Aid declarations.', 'postcode');
    }
  }

  return true;
}

/**
 * Validate Fund creation or update payload
 */
export function validateFundPayload(data, isUpdate = false) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid fund payload object.');
  }

  const { name, is_restricted } = data;

  if (!isUpdate && (!name || typeof name !== 'string' || !name.trim())) {
    throw new ValidationError('Fund name is required.', 'name');
  }

  if (name !== undefined && typeof name === 'string' && !name.trim()) {
    throw new ValidationError('Fund name cannot be empty.', 'name');
  }

  if (is_restricted !== undefined && typeof is_restricted !== 'boolean') {
    throw new ValidationError('is_restricted must be a boolean value.', 'is_restricted');
  }

  return true;
}

/**
 * Validate User creation or update payload
 */
export function validateUserPayload(data, isUpdate = false) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid user payload object.');
  }

  const { email, password, role } = data;

  if (!isUpdate) {
    if (!email || !EMAIL_REGEX.test(email.trim())) {
      throw new ValidationError('A valid user email address is required.', 'email');
    }
    if (!password || password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters.', 'password');
    }
    if (!role || !['ADMIN', 'REVIEWER', 'AUDITOR'].includes(role)) {
      throw new ValidationError("User role must be one of 'ADMIN', 'REVIEWER', or 'AUDITOR'.", 'role');
    }
  } else {
    if (email !== undefined && !EMAIL_REGEX.test(email.trim())) {
      throw new ValidationError('Invalid email format.', 'email');
    }
    if (password !== undefined && password.trim() && password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters.', 'password');
    }
    if (role !== undefined && !['ADMIN', 'REVIEWER', 'AUDITOR'].includes(role)) {
      throw new ValidationError("Invalid role specified. Must be 'ADMIN', 'REVIEWER', or 'AUDITOR'.", 'role');
    }
  }

  return true;
}

/**
 * Validate and sanitize pagination query parameters
 */
export function sanitizePagination(searchParams, defaultPageSize = 15, maxPageSize = 100) {
  const pageParam = parseInt(searchParams?.get('page') || '1', 10);
  const pageSizeParam = parseInt(searchParams?.get('pageSize') || String(defaultPageSize), 10);

  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? defaultPageSize : Math.min(pageSizeParam, maxPageSize);

  return { page, pageSize, offset: (page - 1) * pageSize };
}
