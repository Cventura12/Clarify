import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db/client";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? null, image: user.image ?? null },
        create: { email: user.email, name: user.name ?? null, image: user.image ?? null },
      });
      return true;
    },
    async jwt({ token }) {
      if (!token.email) return token;
      if (!token.userId) {
        const dbUser = await prisma.user.findUnique({ where: { email: token.email as string } });
        if (dbUser) token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}