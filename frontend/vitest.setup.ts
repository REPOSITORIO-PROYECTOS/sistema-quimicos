import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock next/navigation hooks used in components if necessary
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() })
}));

// Basic fetch mock (will be overridden per test when needed)
if (!global.fetch) {
  // @ts-ignore
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
}
