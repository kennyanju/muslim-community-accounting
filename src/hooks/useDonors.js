'use client';

import { useMemo, useCallback } from 'react';
import { useApp } from '@/context/AppContext';

/**
 * Targeted hook for managing donors and Gift Aid declarations.
 */
export function useDonors() {
  const {
    donors,
    setDonors,
    transactions,
    org,
    user,
    fetchAPI,
    addToast,
    refreshData,
    openModal
  } = useApp();

  const giftAidEligibleDonors = useMemo(() => {
    return donors.filter(d => !d.is_anonymous && d.gift_aid_eligible);
  }, [donors]);

  const donorContributions = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED') {
        const dId = t.donor_id || 'anonymous';
        map[dId] = (map[dId] || 0) + (parseFloat(t.total_amount) || 0);
      }
    });
    return map;
  }, [transactions]);

  const updateDonor = useCallback(async (id, data) => {
    try {
      const updated = await fetchAPI(`/api/donors/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      addToast(`Donor profile updated successfully`, 'success');
      refreshData();
      return updated;
    } catch (err) {
      addToast(err.message, 'error');
      throw err;
    }
  }, [fetchAPI, addToast, refreshData]);

  const deleteDonor = useCallback(async (id) => {
    try {
      await fetchAPI(`/api/donors/${id}`, {
        method: 'DELETE'
      });
      addToast('Donor profile deleted', 'success');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
      throw err;
    }
  }, [fetchAPI, addToast, refreshData]);

  return {
    donors,
    setDonors,
    giftAidEligibleDonors,
    donorContributions,
    org,
    user,
    updateDonor,
    deleteDonor,
    openModal
  };
}
