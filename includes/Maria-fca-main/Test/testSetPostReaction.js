"use strict";

const assert = require("assert");

const responseData = {
  data: {
    feedback_react: {
      feedback: {
        viewer_feedback_reaction_info: "LIKE",
        supported_reactions: [1, 2, 4, 3, 7, 8, 16],
        top_reactions: { edges: [] },
        reaction_count: 1,
      },
    },
  },
};

const mockCtx = {
  userID:      "100012345678900",
  jar:         {},
  req_ID:      "123",
  fb_dtsg:     "dtsg_token_123",
  fb_dtsg_ag:  "ag_token_123",
  ttstamp:     "2658100",
  hsi:         "70000000000",
};

// The plugin calls post() synchronously but the callback asynchronously, so a
// single shared capturedForm would be overwritten by later calls before the
// earlier assertions run. Each test gets its own function instance + form.
function buildFunc(ctx) {
  let lastForm = null;
  const func = require("../plugins/setPostReaction")(
    {
      post: function (url, jar, form) {
        lastForm = form;
        return Promise.resolve({
          statusCode: 200,
          body: "for (;;);" + JSON.stringify(responseData),
        });
      },
    },
    {},
    ctx,
  );
  func.getLastForm = () => lastForm;
  return func;
}

function callFunc(func, postID, type) {
  return new Promise((resolve) => {
    func(postID, type, function (err, result) {
      resolve({ err, result, capturedForm: func.getLastForm() });
    });
  });
}

async function runTest() {
  const setPostReactionFunc = buildFunc(mockCtx);

  // Test 1: Valid reaction string 'love'
  {
    const { err, result, capturedForm } = await callFunc(setPostReactionFunc, "post_123", "love");
    assert.strictEqual(err, null, "Should not return error on valid call");
    assert.ok(capturedForm, "Form should be constructed and posted");
    assert.strictEqual(capturedForm.av, mockCtx.userID);
    assert.strictEqual(capturedForm.fb_dtsg, mockCtx.fb_dtsg);
    assert.strictEqual(capturedForm.lsd, mockCtx.fb_dtsg);
    assert.strictEqual(capturedForm.jazoest, mockCtx.ttstamp);
    assert.strictEqual(capturedForm.doc_id, "4769042373179384");
    assert.strictEqual(capturedForm.server_timestamps, true);

    const variables = JSON.parse(capturedForm.variables);
    assert.strictEqual(
      variables.input.feedback_id,
      Buffer.from("feedback:post_123").toString("base64"),
    );
    // New string-based reaction ID for love/heart
    assert.strictEqual(variables.input.feedback_reaction_id, "1678524932434102");
    assert.strictEqual(variables.scale, 1);
    assert.strictEqual(variables.canUseNicknameOnComet, false);
    assert.strictEqual(result.viewer_feedback_reaction_info, "LIKE");
    console.log("Test 1 Passed: 'love' reaction mapped to string ID correctly.");
  }

  // Test 2: Invalid reaction type
  {
    const { err } = await callFunc(setPostReactionFunc, "post_123", "invalid_type");
    assert.ok(err, "Should return error for invalid reaction type");
    assert.strictEqual(
      err.error,
      "setPostReaction: Invalid reaction type",
      "Correct error message returned",
    );
    console.log("Test 2 Passed: Invalid reaction type handled properly.");
  }

  // Test 3: Unlike (type 0) — no feedback_reaction_id in input
  {
    const { err, capturedForm } = await callFunc(setPostReactionFunc, "post_123", 0);
    assert.strictEqual(err, null, "Unlike should not error");
    const variables = JSON.parse(capturedForm.variables);
    assert.strictEqual(variables.input.feedback_reaction_id, undefined);
    console.log("Test 3 Passed: Unlike sends no feedback_reaction_id.");
  }

  // Test 4: ttstamp fallback — ctx without ttstamp
  {
    const ctxNoTtstamp = { ...mockCtx, ttstamp: undefined };
    const funcNoTtstamp = buildFunc(ctxNoTtstamp);
    const { err, capturedForm } = await callFunc(funcNoTtstamp, "post_456", "like");
    assert.strictEqual(err, null, "Should work without ctx.ttstamp");
    assert.ok(capturedForm.jazoest, "jazoest should be computed from fb_dtsg");
    console.log("Test 4 Passed: ttstamp fallback computed from fb_dtsg.");
  }
}

runTest()
  .then(() => {
    console.log("ALL SET-POST-REACTION TESTS PASSED");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

