/**
 * Client-side Form Validation Helper
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;

export function validateClientTransaction(form) {
  const errors = {};

  if (!form.type) errors.type = 'Please select a transaction type.';
  
  const total = parseFloat(form.totalAmount);
  if (isNaN(total) || total <= 0) {
    errors.totalAmount = 'Total amount must be greater than zero.';
  }

  if (!form.splits || form.splits.length === 0) {
    errors.splits = 'At least one fund allocation is required.';
  } else {
    const splitSumCents = form.splits.reduce((acc, s) => acc + Math.round(parseFloat(s.amount || 0) * 100), 0);
    const totalCents = Math.round((parseFloat(form.totalAmount) || 0) * 100);
    if (splitSumCents !== totalCents) {
      errors.splits = `Splits sum (£${(splitSumCents / 100).toFixed(2)}) must equal total amount (£${(totalCents / 100).toFixed(2)}).`;
    }
  }

  if (form.giftAid && form.donorId === 'anonymous') {
    errors.donorId = 'Gift Aid cannot be claimed for Anonymous donors.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function validateClientDonor(form) {
  const errors = {};

  if (!form.name || !form.name.trim()) {
    errors.name = 'Full name is required.';
  }

  if (form.email && form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
    errors.email = 'Invalid email address format.';
  }

  if (form.giftAidEligible) {
    if (!form.address_line_1 || !form.address_line_1.trim()) {
      errors.address_line_1 = 'Address line 1 is required for Gift Aid declarations.';
    }
    if (!form.postcode || !form.postcode.trim()) {
      errors.postcode = 'Postcode is required for Gift Aid declarations.';
    } else if (!UK_POSTCODE_REGEX.test(form.postcode.trim())) {
      errors.postcode = 'Please enter a valid UK postcode (e.g. BS3 1AB).';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
