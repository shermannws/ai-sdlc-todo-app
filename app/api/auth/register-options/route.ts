import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB } from '@/lib/db';
import { setChallenge } from '@/lib/challenge-store';

const rpID = process.env.RP_ID ?? 'localhost';
const rpName = process.env.RP_NAME ?? 'Todo App';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const username = typeof body.username === 'string' ? body.username.trim() : '';

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const existingUser = userDB.findByUsername(username);
  if (existingUser) {
    return NextResponse.json({ error: 'Username already registered' }, { status: 409 });
  }

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(username),
    userName: username,
    attestationType: 'none',
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  setChallenge(`register:${username}`, options.challenge);

  return NextResponse.json(options);
}
