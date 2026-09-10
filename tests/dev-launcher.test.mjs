import test from 'node:test';
import assert from 'node:assert/strict';
import { describeServices } from '../scripts/dev.mjs';

test('development launcher starts the API and Next.js with one command', () => {
  const output = describeServices();

  assert.match(output, /dotnet run .*LockComputer\.Server\.csproj .*5071/);
  assert.match(output, /next dev -p 3000/);
});
