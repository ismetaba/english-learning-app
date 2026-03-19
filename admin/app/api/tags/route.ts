import { NextRequest, NextResponse } from 'next/server';
import { getAllTags, createTag, deleteTag } from '@/lib/db';

export async function GET() {
  return NextResponse.json(getAllTags());
}

export async function POST(request: NextRequest) {
  const { name, category } = await request.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const id = createTag(name, category || 'vocab');
  return NextResponse.json({ id, name, category }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteTag(id);
  return NextResponse.json({ message: 'Tag deleted' });
}
