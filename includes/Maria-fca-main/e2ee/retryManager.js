"use strict";

/**
 * E2EE Retry Manager - pure Node.js port of HerokeyVN/FB-Messenger-E2EE.
 *
 * Handles Messenger E2EE retry receipts. When a recipient's device cannot
 * decrypt a message (missing prekey, lost session, etc.), Facebook sends a
 * <retry> receipt. This manager re-encrypts the cached outbound payload for
 * the requester and resends it so the message is not silently dropped.
 */

const MAX_RETRY_COUNT = 10;

class E2EERetryManager {
  /**
   * @param {Object} opts
   * @param {Object}   opts.cache          OutboundMessageCache-like { get(messageId) }
   * @param {Function} opts.getClient      () => E2EEClient-like
   * @param {Function} opts.getSocket      () => socket|null
   * @param {Function} opts.getSelfJid     () => string
   * @param {Function} opts.getPreKeyBundle (jid: string) => Promise<Object>
   * @param {Function} [opts.log]          (level, tag, ...args) => void
   */
  constructor(opts) {
    if (!opts || typeof opts.getClient !== "function" || typeof opts.getSocket !== "function") {
      throw new Error("E2EERetryManager: getClient and getSocket are required");
    }
    this.opts = opts;
    this.log = opts.log || function (level, tag) {
      var args = Array.prototype.slice.call(arguments, 2);
      (console[level] || console.log).apply(console, ["[E2EE " + tag + "]"].concat(args));
    };
  }

  /**
   * Handle an incoming receipt node. Expects a WA-binary-like node object:
   * { tag: "receipt", attrs: {...}, content: [...] }
   */
  async handleReceipt(node) {
    const retryNode = this._findChild(node, "retry");
    const messageId = String(
      (retryNode && retryNode.attrs && retryNode.attrs.id) ||
      (node && node.attrs && node.attrs.id) ||
      ""
    );
    if (!messageId) return;

    const cached = this.opts.cache && typeof this.opts.cache.get === "function"
      ? this.opts.cache.get(messageId)
      : null;

    if (!cached) {
      this.log("warn", "E2EERetryManager", "Received retry receipt for unknown/out-of-cache E2EE message " + messageId);
      return;
    }

    const requesterJid = this._resolveRetryRequesterJid(node, cached);
    if (!requesterJid) {
      this.log("warn", "E2EERetryManager", "Cannot resolve retry requester for E2EE message " + messageId);
      return;
    }

    const retryCount = Number((retryNode && retryNode.attrs && retryNode.attrs.count) || "1") || 1;
    if (retryCount >= MAX_RETRY_COUNT) {
      this.log("warn", "E2EERetryManager", "Retry count " + retryCount + " >= " + MAX_RETRY_COUNT + " for " + messageId + ", dropping");
      return;
    }

    try {
      const client = this.opts.getClient();
      const socket = this.opts.getSocket();
      if (!client || !socket) {
        this.log("warn", "E2EERetryManager", "E2EE client/socket not ready, cannot retry " + messageId);
        return;
      }

      this.log("info", "E2EERetryManager", "Retrying E2EE message " + messageId + " for " + requesterJid + " (attempt " + retryCount + ")");

      // Refresh prekey bundle for the requester so we can re-establish session
      if (typeof this.opts.getPreKeyBundle === "function") {
        try {
          await this.opts.getPreKeyBundle(requesterJid);
        } catch (e) {
          this.log("warn", "E2EERetryManager", "getPreKeyBundle failed for " + requesterJid + ":", e && e.message ? e.message : e);
        }
      }

      // Re-send the cached outbound payload to the requester
      if (typeof client.sendPayloadToJid === "function") {
        await client.sendPayloadToJid(requesterJid, cached.payload || cached, {
          messageId: messageId,
          retryCount: retryCount,
        });
      } else if (typeof socket.sendFrame === "function" && cached.frame) {
        await socket.sendFrame(cached.frame);
      } else {
        this.log("warn", "E2EERetryManager", "No resend path available for " + messageId);
      }
    } catch (err) {
      this.log("error", "E2EERetryManager", "Retry failed for " + messageId + ":", err && err.message ? err.message : err);
    }
  }

  _findChild(node, tag) {
    if (!node) return null;
    if (node.tag === tag) return node;
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        const found = this._findChild(child, tag);
        if (found) return found;
      }
    }
    return null;
  }

  _resolveRetryRequesterJid(node, cached) {
    // 1) explicit participant/recipient on the retry node
    const retryNode = this._findChild(node, "retry");
    const direct =
      (retryNode && retryNode.attrs && (retryNode.attrs.recipient || retryNode.attrs.participant || retryNode.attrs.from)) ||
      (node && node.attrs && (node.attrs.participant || node.attrs.from));
    if (direct) return String(direct);

    // 2) cached senderJid (the original target)
    if (cached && cached.senderJid) return String(cached.senderJid);
    if (cached && cached.chatJid) return String(cached.chatJid);

    return null;
  }
}

module.exports = E2EERetryManager;
