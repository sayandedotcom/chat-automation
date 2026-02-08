import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../server/trpc.js";
import { prisma } from "@workspace/database";

export const conversationRouter = router({
  /**
   * List all conversations for the authenticated user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.conversation.findMany({
      where: { userId: ctx.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        threadId: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }),

  /**
   * Create a new conversation
   */
  create: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if conversation already exists for this threadId
      const existing = await prisma.conversation.findUnique({
        where: { threadId: input.threadId },
      });

      if (existing) {
        // Return existing conversation instead of creating duplicate
        return existing;
      }

      return prisma.conversation.create({
        data: {
          userId: ctx.user.id,
          threadId: input.threadId,
          title: input.title || "New Chat",
        },
      });
    }),

  /**
   * Get a single conversation by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id, // Ensure user owns this conversation
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return conversation;
    }),

  /**
   * Update conversation title
   */
  updateTitle: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await prisma.conversation.findFirst({
        where: { id: input.id, userId: ctx.user.id },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return prisma.conversation.update({
        where: { id: input.id },
        data: { title: input.title },
      });
    }),

  /**
   * Delete a conversation
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before deleting
      const conversation = await prisma.conversation.findFirst({
        where: { id: input.id, userId: ctx.user.id },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return prisma.conversation.delete({
        where: { id: input.id },
      });
    }),
});
