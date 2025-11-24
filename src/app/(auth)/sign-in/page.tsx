"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Camera } from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await authClient.signIn.username({
        username,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Failed to sign in");
        setIsLoading(false);
        return;
      }

      router.push("/batches");
    } catch {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-yellow-50 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-10 left-10 w-32 h-32 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
        <div className="absolute top-10 right-10 w-32 h-32 bg-yellow-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-32 h-32 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

      <div className="w-full max-w-md relative">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border-2 border-black p-3 shadow-hard rotate-3 z-10">
            <Camera className="w-8 h-8 text-black" />
        </div>

        <Card className="border-2 border-black shadow-[8px_8px_0px_0px_#000] bg-white relative z-0">
          <CardHeader className="text-center pt-10 pb-2">
            <CardTitle className="text-3xl font-black uppercase">Product Pics</CardTitle>
            <CardDescription className="text-base font-medium text-gray-600">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-red-100 border-2 border-red-500 p-3 text-sm font-bold text-red-700 shadow-[2px_2px_0px_0px_#ef4444]">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username" className="font-bold uppercase text-xs tracking-wider">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-gray-50 focus:bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="font-bold uppercase text-xs tracking-wider">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-gray-50 focus:bg-white"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-6">
              <Button type="submit" className="w-full text-lg h-12" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
