export interface OrderRequest {
  orderId: string;
  amount: number;
  userId: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  description: string;
  createdAt?: string;
}
