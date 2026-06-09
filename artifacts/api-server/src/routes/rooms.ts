import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, roomsTable, playersTable } from "@workspace/db";
import {
  AddPlayerParams,
  AddPlayerBody,
  UpdatePlayerParams,
  UpdatePlayerBody,
  RemovePlayerParams,
  SetAllAttendanceParams,
  SetAllAttendanceBody,
  GetRoomParams,
} from "@workspace/api-zod";
import { broadcastToRoom } from "../lib/roomBroadcast";

const router: IRouter = Router();

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function getRoomByCode(code: string) {
  const [room] = await db.select().from(roomsTable).where(eq(roomsTable.code, code));
  return room ?? null;
}

async function buildRoomState(roomId: number, code: string) {
  const players = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.roomId, roomId))
    .orderBy(playersTable.createdAt);
  return {
    room: { id: roomId, code },
    players,
  };
}

// POST /rooms — create a new room
router.post("/rooms", async (req, res): Promise<void> => {
  let code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await getRoomByCode(code);
    if (!existing) break;
    code = generateCode();
    attempts++;
  }
  const [room] = await db.insert(roomsTable).values({ code }).returning();
  req.log.info({ code: room.code }, "Room created");
  res.status(201).json(await buildRoomState(room.id, room.code));
});

// GET /rooms/:code — fetch room state
router.get("/rooms/:code", async (req, res): Promise<void> => {
  const params = GetRoomParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const room = await getRoomByCode(params.data.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json(await buildRoomState(room.id, room.code));
});

// POST /rooms/:code/players — add player
router.post("/rooms/:code/players", async (req, res): Promise<void> => {
  const params = AddPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddPlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const room = await getRoomByCode(params.data.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const [player] = await db
    .insert(playersTable)
    .values({ ...body.data, roomId: room.id, attending: false })
    .returning();
  broadcastToRoom(room.code, { type: "room-updated" });
  res.status(201).json(player);
});

// PATCH /rooms/:code/players/:playerId — update player
router.patch("/rooms/:code/players/:playerId", async (req, res): Promise<void> => {
  const params = UpdatePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const room = await getRoomByCode(params.data.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const [player] = await db
    .update(playersTable)
    .set(body.data)
    .where(and(eq(playersTable.id, params.data.playerId), eq(playersTable.roomId, room.id)))
    .returning();
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  broadcastToRoom(room.code, { type: "room-updated" });
  res.json(player);
});

// DELETE /rooms/:code/players/:playerId — remove player
router.delete("/rooms/:code/players/:playerId", async (req, res): Promise<void> => {
  const params = RemovePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const room = await getRoomByCode(params.data.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const [deleted] = await db
    .delete(playersTable)
    .where(and(eq(playersTable.id, params.data.playerId), eq(playersTable.roomId, room.id)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  broadcastToRoom(room.code, { type: "room-updated" });
  res.sendStatus(204);
});

// PUT /rooms/:code/attendance — bulk set attending flag
router.put("/rooms/:code/attendance", async (req, res): Promise<void> => {
  const params = SetAllAttendanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SetAllAttendanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const room = await getRoomByCode(params.data.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  await db
    .update(playersTable)
    .set({ attending: body.data.attending })
    .where(eq(playersTable.roomId, room.id));
  broadcastToRoom(room.code, { type: "room-updated" });
  res.json(await buildRoomState(room.id, room.code));
});

export default router;
