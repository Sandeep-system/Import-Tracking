import { Suspense } from 'react';
import initialDataRaw from '@/lib/initialData.json';
import PurchaseOrderDetailClient from './PurchaseOrderDetailClient';

export function generateStaticParams() {
  const ids = new Set<string>();

  // 1. Literal '[id]' and placeholder routes so direct visits / template routes never throw
  ids.add('[id]');
  ids.add('view');
  ids.add('new');

  // 2. All baseline PO numbers and IDs from dataset
  (initialDataRaw.purchaseOrders || []).forEach((po: any) => {
    if (po.po_number) ids.add(String(po.po_number));
    if (po.id) ids.add(String(po.id));
  });

  // 3. Pre-generate future & client-created PO IDs (1100 - 1500)
  for (let n = 1100; n <= 1500; n++) {
    ids.add(String(n));
    ids.add(`po-${n}`);
  }

  return Array.from(ids).map(id => ({ id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-xs">Loading purchase order...</div>}>
      <PurchaseOrderDetailClient id={id} />
    </Suspense>
  );
}
