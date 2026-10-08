import { NextRequest, NextResponse } from 'next/server';
import { POST as openphonePost, GET as openphoneGet } from '../webhooks/openphone/route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return openphonePost(request);
}

export async function GET() {
  const response = await openphoneGet();
  const data = await response.json();
  return NextResponse.json({
    ...data,
    legacy_endpoint: '/api/webhook',
  });
}
