import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { getAndDeleteChallenge } from '@/lib/challenge-store';

const rpID = process.env.RP_ID ?? 'localhost';
const origin = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { username, response } = body;

  if (!username || !response) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const user = userDB.findByUsername(username);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const expectedChallenge = getAndDeleteChallenge(`login:${username}`);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'Challenge expired or not found. Please try again.' }, { status: 400 });
  }

  // Resolve credential ID — may be in response.id or response.rawId
  const credentialId = response.id ?? response.rawId;
  const authenticator = authenticatorDB.findByCredentialId(credentialId);

  if (!authenticator || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credential_id,
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  const { verified, authenticationInfo } = verification;
  if (!verified) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  // Clone-attack defense: new counter must exceed stored counter (both-zero allowed)
  const newCounter = authenticationInfo.newCounter;
  const oldCounter = authenticator.counter ?? 0;
  if (newCounter > 0 && newCounter <= oldCounter) {
    return NextResponse.json({ error: 'Counter regression detected — possible cloned authenticator' }, { status: 401 });
  }

  authenticatorDB.updateCounter(authenticator.id, newCounter);
  await createSession({ userId: user.id, username: user.username });

  return NextResponse.json({ verified: true });
}
