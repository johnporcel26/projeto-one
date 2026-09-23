import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "../src/SessionManager.js";
import { calculateRubyPriceCents } from "../src/economy.js";

test("ruby package pricing preserves the 50-unit promotion", () => {
  assert.equal(calculateRubyPriceCents(1), 100);
  assert.equal(calculateRubyPriceCents(50), 4500);
  assert.equal(calculateRubyPriceCents(51), 4600);
});

test("marketplace escrows the item, settles Berries and blocks self-trade", () => {
  const sessions = new SessionManager();
  const seller = sessions.createSession(), buyer = sessions.createSession();
  seller.player.inventory.add("item_gravel", 2);
  assert.equal(sessions.auction.createListing(seller.player, "item_gravel", 2, 100, undefined, true, 0).ok, true);
  const listing = sessions.auction.snapshotFor(buyer.player.id, 1).listings[0]!;
  assert.equal(seller.player.inventory.quantity("item_gravel"), 0);
  assert.equal(sessions.auction.buy(seller.player, listing.id, "BERRIES", 1).ok, false);
  buyer.player.wallet.berries = 100;
  assert.equal(sessions.auction.buy(buyer.player, listing.id, "BERRIES", 1).ok, true);
  assert.equal(buyer.player.inventory.quantity("item_gravel"), 2);
  assert.equal(seller.player.wallet.berries, 90);
  assert.equal(buyer.player.wallet.berries, 0);
});

test("offers reserve funds and a cancelled listing refunds them", () => {
  const sessions = new SessionManager();
  const seller = sessions.createSession(), buyer = sessions.createSession();
  seller.player.inventory.add("item_soap", 1);
  sessions.auction.createListing(seller.player, "item_soap", 1, undefined, undefined, true, 0);
  const listing = sessions.auction.snapshotFor(buyer.player.id, 1).listings[0]!;
  buyer.player.wallet.rubies = 7;
  assert.equal(sessions.auction.offer(buyer.player, listing.id, "RUBIES", 7, 1).ok, true);
  assert.equal(buyer.player.wallet.reservedRubies, 7);
  assert.equal(sessions.auction.cancel(seller.player, listing.id).ok, true);
  assert.equal(buyer.player.wallet.reservedRubies, 0);
  assert.equal(buyer.player.wallet.rubies, 7);
  assert.equal(seller.player.inventory.quantity("item_soap"), 1);
});

test("locked items cannot be listed until the player explicitly unlocks them", () => {
  const sessions = new SessionManager();
  const seller = sessions.createSession();
  seller.player.inventory.add("item_gravel", 1);
  seller.player.setItemLocked("item_gravel", true);
  assert.equal(sessions.auction.createListing(seller.player, "item_gravel", 1, 10, undefined, false, 0).ok, false);
  seller.player.setItemLocked("item_gravel", false);
  assert.equal(sessions.auction.createListing(seller.player, "item_gravel", 1, 10, undefined, false, 0).ok, true);
});
