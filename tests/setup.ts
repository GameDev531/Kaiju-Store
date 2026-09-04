/**
 * Test environment.
 *
 * Set explicitly rather than read from .env so the suite is hermetic: it runs
 * identically on a laptop and in CI, and a developer's local configuration can
 * never make a test pass that would fail elsewhere.
 */
process.env.NODE_ENV = "test";
process.env.APP_ENV = "test";
// One database for the whole suite, prepared by tests/global-setup.ts. Set here
// (not with ??=) so a developer's shell DATABASE_URL can never point the tests
// at a real database.
process.env.DATABASE_URL = "file:./prisma/vitest.db";
process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real-0123456789abcdef";
process.env.APP_URL = "http://localhost:3000";
process.env.STORAGE_DIR = "./var/test-storage";
process.env.AI_PROVIDER = "heuristic";
process.env.PAYMENT_PROVIDER = "mock";
process.env.PAYMENT_WEBHOOK_SECRET = "test-payment-webhook-secret";
process.env.SHIPPING_PROVIDER = "manual";
process.env.SHIPPING_WEBHOOK_SECRET = "test-shipping-webhook-secret";
process.env.LOG_LEVEL = "error";
// Rate limiting is exercised by its own test with the limiter switched back on.
process.env.RATE_LIMIT_DISABLED = "false";
