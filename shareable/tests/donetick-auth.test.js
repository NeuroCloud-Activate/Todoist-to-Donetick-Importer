const assert = require("node:assert/strict");
const { buildChoreImportUpdatePayload, buildChoreLabelUpdatePayload, DonetickClient, hasMissingLabelRefs } = require("../src/lib/donetick");
const { stripTransientSecrets } = require("../src/lib/settingsStore");

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function testJwtIsPrimaryForFullApiAndLabels() {
  const calls = [];
  const client = new DonetickClient({
    baseUrl: "http://donetick.test",
    apiKey: "api-key",
    username: "user@example.test",
    password: "password",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/api/v1/auth/login")) {
        return jsonResponse({ access_token: "jwt-token" });
      }
      if (String(url).endsWith("/api/v1/chores/")) {
        return jsonResponse({ res: [] });
      }
      if (String(url).endsWith("/api/v1/labels")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected URL ${url}`);
    }
  });

  await client.getChores("full");
  await client.getLabels();

  assert.equal(calls[0].url, "http://donetick.test/api/v1/auth/login");
  assert.equal(calls[1].options.headers.Authorization, "Bearer jwt-token");
  assert.equal(calls[1].options.headers.secretkey, undefined);
  assert.equal(calls[2].options.headers.Authorization, "Bearer jwt-token");
}

async function testSimpleApiUsesApiKeyFallback() {
  const calls = [];
  const client = new DonetickClient({
    baseUrl: "http://donetick.test",
    apiKey: "api-key",
    username: "user@example.test",
    password: "password",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return jsonResponse([]);
    }
  });

  await client.getChores("simple");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://donetick.test/eapi/v1/chore");
  assert.equal(calls[0].options.headers.secretkey, "api-key");
  assert.equal(calls[0].options.headers.Authorization, undefined);
}

async function testPastedJwtTokenDoesNotLogin() {
  const calls = [];
  const client = new DonetickClient({
    baseUrl: "http://donetick.test",
    apiKey: "api-key",
    authToken: "pasted-jwt",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ res: [] });
    }
  });

  await client.getChores("full");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://donetick.test/api/v1/chores/");
  assert.equal(calls[0].options.headers.Authorization, "Bearer pasted-jwt");
}

async function testDueDateRouteUsesFullApiAuth() {
  const calls = [];
  const client = new DonetickClient({
    baseUrl: "http://donetick.test",
    authToken: "pasted-jwt",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ res: { id: 42 } });
    }
  });

  await client.updateChoreDueDate(42, "2026-07-01T13:00:00.000Z", "2026-06-30T12:00:00.000Z");

  assert.equal(calls[0].url, "http://donetick.test/api/v1/chores/42/dueDate");
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].options.headers.Authorization, "Bearer pasted-jwt");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    dueDate: "2026-07-01T13:00:00.000Z",
    updatedAt: "2026-06-30T12:00:00.000Z"
  });
}

async function testFullApiFallsBackToApiKeyWhenJwtFails() {
  const calls = [];
  const client = new DonetickClient({
    baseUrl: "http://donetick.test",
    apiKey: "api-key",
    username: "user@example.test",
    password: "bad-password",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/api/v1/auth/login")) {
        return jsonResponse({ error: "Invalid credentials" }, 401);
      }
      return jsonResponse({ res: [] });
    }
  });

  await client.getChores("full");

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://donetick.test/api/v1/auth/login");
  assert.equal(calls[1].url, "http://donetick.test/api/v1/chores/");
  assert.equal(calls[1].options.headers.secretkey, "api-key");
}

function testLabelUpdatePayloadPreservesChoreShape() {
  const payload = buildChoreLabelUpdatePayload({
    id: 42,
    name: "Existing chore",
    frequencyType: "once",
    frequency: 1,
    isActive: true,
    assignStrategy: "no_assignee",
    priority: 2,
    description: "Existing description",
    labelsV2: [{ id: 7 }]
  }, [{ id: 9 }]);

  assert.equal(payload.id, 42);
  assert.equal(payload.name, "Existing chore");
  assert.deepEqual(payload.labelsV2, [{ id: 7 }, { id: 9 }]);
  assert.equal(payload.description, "Existing description");
}

function testImportUpdatePayloadBackfillsDueDate() {
  const payload = buildChoreImportUpdatePayload({
    id: 42,
    name: "Existing chore",
    frequencyType: "once",
    frequency: 1,
    isActive: true,
    assignStrategy: "no_assignee",
    priority: 2,
    description: "Existing description",
    labelsV2: []
  }, {
    payload: {
      nextDueDate: "2026-07-01T13:00:00.000Z",
      frequencyType: "weekly",
      frequency: 1,
      labelsV2: [{ id: 9 }]
    }
  });

  assert.equal(payload.nextDueDate, "2026-07-01T13:00:00.000Z");
  assert.equal(payload.frequencyType, "weekly");
  assert.deepEqual(payload.labelsV2, [{ id: 9 }]);
  assert.equal(payload.description, "Existing description");
}

function testMissingLabelRefs() {
  assert.equal(hasMissingLabelRefs([{ id: 1 }], [{ id: 1 }]), false);
  assert.equal(hasMissingLabelRefs([{ id: 1 }], [{ id: 2 }]), true);
}

function testPasswordIsNotSaved() {
  const sanitized = stripTransientSecrets({
    donetickUsername: "user@example.test",
    donetickPassword: "secret-password",
    donetickAuthToken: "jwt-token",
    donetickApiKey: "api-key"
  });

  assert.equal(sanitized.donetickUsername, "user@example.test");
  assert.equal(sanitized.donetickApiKey, "api-key");
  assert.equal(sanitized.donetickAuthToken, "jwt-token");
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized, "donetickPassword"), false);
}

Promise.resolve()
  .then(testJwtIsPrimaryForFullApiAndLabels)
  .then(testSimpleApiUsesApiKeyFallback)
  .then(testPastedJwtTokenDoesNotLogin)
  .then(testDueDateRouteUsesFullApiAuth)
  .then(testFullApiFallsBackToApiKeyWhenJwtFails)
  .then(testLabelUpdatePayloadPreservesChoreShape)
  .then(testImportUpdatePayloadBackfillsDueDate)
  .then(testMissingLabelRefs)
  .then(testPasswordIsNotSaved)
  .then(() => console.log("donetick auth tests passed"));
