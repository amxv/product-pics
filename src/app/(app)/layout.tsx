import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b-2 border-black bg-white sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/batches" className="text-xl font-black uppercase tracking-tight text-black border-2 border-black bg-yellow-300 px-2 py-1 shadow-hard-sm -rotate-2 hover:rotate-0 transition-transform">
                Product Pics
              </Link>
              <div className="hidden md:flex items-baseline space-x-4">
                <Link
                  href="/batches"
                  className="px-3 py-2 text-sm font-bold text-black hover:bg-black hover:text-white transition-colors border-2 border-transparent hover:border-black"
                >
                  Batches
                </Link>
              </div>
            </div>
            <UserMenu user={session.user} />
          </div>
        </div>
      </nav>
      <main className="min-h-[calc(100vh-65px)]">{children}</main>
    </div>
  );
}
