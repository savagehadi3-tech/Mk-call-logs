import { NextRequest } from 'next/server';
import { POST as quoPost, GET as quoGet } from '../webhooks/quo/route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return quoPost(request);
}

export async function GET() {
  return quoGet();
}
