import initialDataRaw from '@/lib/initialData.json';
import PurchaseOrderDetailClient from './PurchaseOrderDetailClient';

export function generateStaticParams() {
  return (initialDataRaw.purchaseOrders || []).map((po: any) => ({
    id: String(po.po_number),
  }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchaseOrderDetailClient id={id} />;
}
