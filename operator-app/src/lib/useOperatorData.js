// A custom React hook: loads an operator's trucks and documents and gives back a reload() function.
// Both the setup screen and the home screen need this, so it lives in one place instead of two.
import { useCallback, useEffect, useState } from 'react';
import { listDocuments, listTrucks } from './api';

export function useOperatorData(operatorId) {
  const [trucks, setTrucks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      // Both requests start at once and we wait for both, instead of one after the other.
      const [t, d] = await Promise.all([listTrucks(operatorId), listDocuments(operatorId)]);
      setTrucks(t);
      setDocuments(d);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [operatorId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { trucks, documents, loading, error, reload };
}
