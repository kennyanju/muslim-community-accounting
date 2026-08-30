/**
 * Client-side Form Validation Helpers with Field-Level Inline Error Mapping
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;

/**
 * Validate Transaction creation payload
 */
export function validateClientTransaction(form, availableBalances = []) {
  const errors = {};

  if (!form.type || !['income', 'expense', 'INCOME', 'EXPENSE'].includes(form.type)) {
    errors.type = 'Please select a valid transaction type (Income or Expense).';
  }

  const total = parseFloat(form.totalAmount);
  if (isNaN(total) || total <= 0) {
    errors.totalAmount = 'Total amount must be a valid positive number greater than £0.00.';
  }

  if (!form.date) {
    errors.date = 'Transaction date is required.';
  }

  if (!form.splits || form.splits.length === 0) {
    errors.splits = 'At least one fund allocation is required.';
  } else {
    let splitSumCents = 0;
    const splitErrors = [];

    form.splits.forEach((s, idx) => {
      const splitAmt = parseFloat(s.amount);
      if (!s.fund_id) {
        splitErrors.push(`Split #${idx + 1} is missing a designated fund.`);
      }
      if (isNaN(splitAmt) || splitAmt <= 0) {
        splitErrors.push(`Split #${idx + 1} must have an amount greater than zero.`);
      } else {
        splitSumCents += Math.round(splitAmt * 100);
      }
    });

    if (splitErrors.length > 0) {
      errors.splits = splitErrors[0];
    } else {
      const totalCents = Math.round((total || 0) * 100);
      if (splitSumCents !== totalCents) {
        errors.splits = `Allocated splits (£${(splitSumCents / 100).toFixed(2)}) must exactly match total amount (£${(totalCents / 100).toFixed(2)}).`;
      }
    }
  }

  if (form.giftAid && form.donorId === 'anonymous') {
    errors.giftAid = 'UK HMRC Gift Aid declarations cannot be claimed for anonymous donors.';
  }

  // Shariah Restricted Fund Expense Compliance Check
  if (form.type?.toLowerCase() === 'expense' && Array.isArray(form.splits)) {
    const restrictedViolation = form.splits.some(s => {
      const fund = availableBalances.find(b => b.fundId === s.fund_id);
      if (fund && fund.isRestricted && (fund.fundName === 'Zakat' || fund.fundName === 'Fitrana')) {
        return form.category !== 'Charitable Payout' || !form.notes || !form.notes.trim();
      }
      return false;
    });

    if (restrictedViolation) {
      errors.notes = "Shariah Rule: Restricted Zakat/Fitrana payouts require category 'Charitable Payout' and explicit Asnaf beneficiary audit notes.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate Donor registration payload
 */
export function validateClientDonor(form) {
  const errors = {};

  if (!form.name || !form.name.trim()) {
    errors.name = 'Full donor name is required.';
  }

  if (form.email && form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
    errors.email = 'Please enter a valid email address (e.g. name@domain.co.uk).';
  }

  if (form.giftAidEligible) {
    if (!form.address_line_1 || !form.address_line_1.trim()) {
      errors.address_line_1 = 'Address line 1 is required for HMRC Gift Aid compliance.';
    }
    if (!form.postcode || !form.postcode.trim()) {
      errors.postcode = 'Postcode is mandatory for UK Gift Aid declarations.';
    } else if (!UK_POSTCODE_REGEX.test(form.postcode.trim())) {
      errors.postcode = 'Please enter a valid UK postcode (e.g. BS3 1AB).';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate User account creation payload
 */
export function validateClientUser(form) {
  const errors = {};

  if (!form.name || !form.name.trim()) {
    errors.name = 'Full name is required.';
  }

  if (!form.email || !form.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(form.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!form.password) {
    errors.password = 'Password is required.';
  } else if (form.password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  if (!form.role || !['ADMIN', 'REVIEWER', 'AUDITOR'].includes(form.role)) {
    errors.role = 'Please select a valid role (Financial Secretary, Committee, or Auditor).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate Login credentials
 */
export function validateClientLogin(form) {
  const errors = {};

  if (!form.email || !form.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_REGEX.test(form.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!form.password) {
    errors.password = 'Password is required.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
