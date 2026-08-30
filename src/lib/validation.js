/**
 * Centralized Schema & Input Validation
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/;

export const ALLOWED_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'DIRECT_DEBIT'];
export const ALLOWED_INCOME_CATEGORIES = ['Donation', 'Zakat', 'Fitrana', 'Madrasah Fees', 'Event Tickets', 'Interest', 'Other'];
export const ALLOWED_EXPENSE_CATEGORIES = ['Utilities', 'Salaries', 'Maintenance', 'Charitable Payout', 'Office Supplies', 'Travel', 'Other'];
export const ALLOWED_USER_ROLES = ['ADMIN', 'REVIEWER', 'AUDITOR'];

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

  const { type, totalAmount, splits, method, category, date } = data;

  if (!type || !['INCOME', 'EXPENSE'].includes(type.toUpperCase())) {
    throw new ValidationError("Transaction type must be either 'INCOME' or 'EXPENSE'.", 'type');
  }

  const normalizedType = type.toUpperCase();

  if (method) {
    const normMethod = method.toUpperCase().replace(/\s+/g, '_');
    if (!ALLOWED_METHODS.includes(normMethod)) {
      throw new ValidationError(`Invalid payment method '${method}'. Allowed: ${ALLOWED_METHODS.join(', ')}`, 'method');
    }
  }

  if (category) {
    const allowedCats = normalizedType === 'INCOME' ? ALLOWED_INCOME_CATEGORIES : ALLOWED_EXPENSE_CATEGORIES;
    if (!allowedCats.includes(category)) {
      throw new ValidationError(`Invalid category '${category}' for ${normalizedType}. Allowed: ${allowedCats.join(', ')}`, 'category');
    }
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
    if (!s.fund_id || typeof s.fund_id !== 'string') {
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

  if (date) {
    if (typeof date !== 'string' || !ISO_DATE_REGEX.test(date) || isNaN(new Date(date).getTime())) {
      throw new ValidationError('Transaction date must be a valid ISO format date (YYYY-MM-DD).', 'date');
    }
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
    if (!address_line_1 || typeof address_line_1 !== 'string' || !address_line_1.trim()) {
      throw new ValidationError('Address line 1 is mandatory for UK HMRC Gift Aid declarations.', 'address_line_1');
    }
    if (!postcode || typeof postcode !== 'string' || !postcode.trim() || !UK_POSTCODE_REGEX.test(postcode.trim())) {
      throw new ValidationError('A valid UK postcode is mandatory for UK HMRC Gift Aid declarations.', 'postcode');
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
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      throw new ValidationError('A valid user email address is required.', 'email');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters.', 'password');
    }
    if (!role || !ALLOWED_USER_ROLES.includes(role)) {
      throw new ValidationError(`User role must be one of: ${ALLOWED_USER_ROLES.join(', ')}`, 'role');
    }
  } else {
    if (email !== undefined && (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()))) {
      throw new ValidationError('Invalid email format.', 'email');
    }
    if (password !== undefined && password.trim() && password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters.', 'password');
    }
    if (role !== undefined && !ALLOWED_USER_ROLES.includes(role)) {
      throw new ValidationError(`Invalid role specified. Must be one of: ${ALLOWED_USER_ROLES.join(', ')}`, 'role');
    }
  }

  return true;
}

/**
 * Validate and parse date range query parameters
 */
export function validateDateRange(dateFrom, dateTo) {
  let fromTime = null;
  let toTime = null;

  if (dateFrom) {
    if (typeof dateFrom !== 'string' || !ISO_DATE_REGEX.test(dateFrom) || isNaN(new Date(dateFrom).getTime())) {
      throw new ValidationError("Invalid 'dateFrom' parameter. Must be a valid date in YYYY-MM-DD format.", 'dateFrom');
    }
    fromTime = new Date(dateFrom).getTime();
  }

  if (dateTo) {
    if (typeof dateTo !== 'string' || !ISO_DATE_REGEX.test(dateTo) || isNaN(new Date(dateTo).getTime())) {
      throw new ValidationError("Invalid 'dateTo' parameter. Must be a valid date in YYYY-MM-DD format.", 'dateTo');
    }
    toTime = new Date(dateTo + (dateTo.length <= 10 ? 'T23:59:59.999Z' : '')).getTime();
  }

  if (fromTime && toTime && fromTime > toTime) {
    throw new ValidationError("'dateFrom' cannot be after 'dateTo'.", 'dateRange');
  }

  return { fromTime, toTime };
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

/**
 * Deep schema validator for Database Backup Restore payload
 */
export function validateBackupPayload(backupData) {
  if (!backupData || typeof backupData !== 'object') {
    throw new ValidationError('Invalid backup payload: Must be a JSON object.');
  }

  if (!Array.isArray(backupData.funds) || backupData.funds.length === 0) {
    throw new ValidationError('Invalid backup payload: Missing required funds array.');
  }

  if (!Array.isArray(backupData.transactions)) {
    throw new ValidationError('Invalid backup payload: Missing transactions array.');
  }

  if (!Array.isArray(backupData.transaction_splits)) {
    throw new ValidationError('Invalid backup payload: Missing transaction_splits array.');
  }

  // Validate fund entries
  for (const fund of backupData.funds) {
    if (!fund.id || !fund.name || typeof fund.is_restricted !== 'boolean') {
      throw new ValidationError(`Invalid fund entry in backup: ${JSON.stringify(fund)}`);
    }
  }

  // Validate transaction entries
  for (const tx of backupData.transactions) {
    if (!tx.id || !tx.type || !['INCOME', 'EXPENSE'].includes(tx.type)) {
      throw new ValidationError(`Invalid transaction record in backup: ${tx.id || 'unknown ID'}`);
    }
    const amt = parseFloat(tx.total_amount);
    if (isNaN(amt) || amt < 0) {
      throw new ValidationError(`Invalid total_amount on transaction ${tx.id}`);
    }
  }

  // Validate splits
  for (const split of backupData.transaction_splits) {
    if (!split.id || !split.transaction_id || !split.fund_id) {
      throw new ValidationError(`Invalid transaction split record in backup: ${split.id || 'unknown ID'}`);
    }
    const amt = parseFloat(split.amount);
    if (isNaN(amt) || amt < 0) {
      throw new ValidationError(`Invalid split amount on split ${split.id}`);
    }
  }

  return true;
}
