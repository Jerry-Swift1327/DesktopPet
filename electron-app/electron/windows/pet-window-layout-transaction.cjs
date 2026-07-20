function createPetWindowLayoutTransaction(options = {}) {
  const {
    sendPrepare = () => {},
    sendCommit = () => {},
    sendCancel = () => {},
    applyBounds = () => false,
    onPendingChange = () => {},
    onSettled = () => {},
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    timeoutMs = 240
  } = options;

  let nextToken = 0;
  let pending = null;

  function clearPendingTimer(transaction) {
    if (transaction?.timer !== null && transaction?.timer !== undefined) {
      clearTimeoutFn(transaction.timer);
      transaction.timer = null;
    }
  }

  function scheduleTimeout(transaction) {
    clearPendingTimer(transaction);
    transaction.timer = setTimeoutFn(() => handleTimeout(transaction.token), timeoutMs);
    transaction.timer?.unref?.();
  }

  function settle(transaction, completed, trigger) {
    if (!pending || pending.token !== transaction.token) {
      return false;
    }
    clearPendingTimer(transaction);
    pending = null;
    onSettled({
      completed,
      token: transaction.token,
      layout: transaction.layout,
      reason: transaction.reason,
      trigger
    });
    onPendingChange(false, transaction);
    for (const callback of transaction.waiters) {
      callback({ completed, trigger, token: transaction.token });
    }
    return true;
  }

  function commitBounds(transaction, trigger) {
    if (!pending || pending.token !== transaction.token || transaction.phase !== "preparing") {
      return false;
    }
    transaction.phase = "committed";
    const applied = applyBounds(transaction.layout, {
      token: transaction.token,
      reason: transaction.reason,
      trigger
    });
    if (applied === false) {
      sendCancel({
        token: transaction.token,
        scale: transaction.scale,
        reason: "bounds-rejected"
      });
      return settle(transaction, false, "bounds-rejected");
    }
    sendCommit({
      token: transaction.token,
      scale: transaction.scale,
      reason: transaction.reason
    });
    scheduleTimeout(transaction);
    return true;
  }

  function handleTimeout(token) {
    if (!pending || pending.token !== token) {
      return false;
    }
    if (pending.phase === "preparing") {
      return commitBounds(pending, "prepare-timeout");
    }
    sendCancel({
      token: pending.token,
      scale: pending.scale,
      reason: "paint-timeout"
    });
    return settle(pending, true, "paint-timeout");
  }

  function prepare({ layout, scale, reason = "" } = {}) {
    if (!layout || !scale) {
      return null;
    }

    const wasPending = Boolean(pending);
    const waiters = pending?.waiters || [];
    if (pending) {
      clearPendingTimer(pending);
      sendCancel({ token: pending.token, reason: "superseded" });
    }

    const token = ++nextToken;
    pending = {
      token,
      layout,
      scale,
      reason,
      phase: "preparing",
      timer: null,
      waiters
    };
    scheduleTimeout(pending);
    if (!wasPending) {
      onPendingChange(true, pending);
    }
    sendPrepare({ token, scale, reason });
    return token;
  }

  function confirm(token, phase) {
    if (!pending || pending.token !== Number(token)) {
      return false;
    }
    if (phase === "prepared") {
      return commitBounds(pending, "renderer-prepared");
    }
    if (phase === "painted" && pending.phase === "committed") {
      return settle(pending, true, "renderer-painted");
    }
    return false;
  }

  function cancel({ scale, reason = "" } = {}) {
    if (!pending) {
      return false;
    }
    const transaction = pending;
    sendCancel({ token: transaction.token, scale, reason });
    return settle(transaction, false, "cancelled");
  }

  function whenSettled(callback) {
    if (typeof callback !== "function") {
      return false;
    }
    if (!pending) {
      callback({ completed: true, trigger: "already-settled", token: null });
      return false;
    }
    pending.waiters.push(callback);
    return true;
  }

  function getPending() {
    return pending
      ? {
        token: pending.token,
        layout: pending.layout,
        scale: pending.scale,
        reason: pending.reason,
        phase: pending.phase
      }
      : null;
  }

  return { prepare, confirm, cancel, whenSettled, getPending };
}

module.exports = { createPetWindowLayoutTransaction };
