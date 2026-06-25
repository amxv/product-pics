import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowRight, Check, Images, Package2, ScanSearch, Shirt, Sparkles } from 'lucide-react';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const featureCards = [
  {
    title: 'Built for catalog batches',
    body: 'Upload up to 100 source images, run generation in the background, and download a finished pack without babysitting every shot.',
    icon: Package2,
    tone: 'bg-secondary',
  },
  {
    title: 'Fits kids and adult apparel',
    body: 'Create ecommerce scenes for babies, boys, girls, men, and women with prompt logic that adapts to the selected age range.',
    icon: Shirt,
    tone: 'bg-accent text-white',
  },
  {
    title: 'Keeps product details intact',
    body: 'The generation flow is tuned for preserving garment color, texture, logos, and overall silhouette from the uploaded source image.',
    icon: ScanSearch,
    tone: 'bg-primary text-white',
  },
] as const;

const workflowSteps = [
  'Create a batch with the target demographic and age range.',
  'Upload flat apparel shots directly to cloud storage.',
  'Let Product Pics assign varied lifestyle backgrounds and process images asynchronously.',
  'Review progress, retry failures, and download the completed asset pack.',
] as const;

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const primaryHref = session ? '/batches' : '/sign-in';
  const primaryLabel = session ? 'Open Dashboard' : 'Sign In to Start';

  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.42)_100%)]" />
      <div className="absolute left-[-4rem] top-24 h-40 w-40 rotate-12 border-2 border-black bg-secondary shadow-hard-lg" />
      <div className="absolute right-[-2rem] top-40 h-28 w-28 -rotate-12 border-2 border-black bg-accent shadow-hard" />
      <div className="absolute bottom-16 right-[8%] h-36 w-36 rotate-6 border-2 border-black bg-primary shadow-hard-lg" />

      <section className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] shadow-hard-sm">
              <Sparkles className="h-4 w-4" />
              AI product photos for real catalog throughput
            </div>

            <div className="space-y-5">
              <p className="max-w-3xl text-sm font-black uppercase tracking-[0.25em] text-muted-foreground">
                Neo-brutalist ecommerce imaging workflow
              </p>
              <h1 className="max-w-4xl text-5xl font-black uppercase leading-none tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Turn flat apparel shots into bold storefront-ready lifestyle photos.
              </h1>
              <p className="max-w-2xl text-lg font-medium leading-8 text-foreground/80 sm:text-xl">
                Product Pics helps merchandising teams generate polished product imagery for kids and adult apparel without rebuilding every scene by hand. Choose the model demographic, set an age range, upload your products, and let the batch engine do the heavy lifting.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="min-w-[220px]">
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-w-[220px] bg-white">
                <Link href={session ? '/batches/new' : '/sign-in'}>
                  Create a Batch
                </Link>
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {['100 images per batch', 'Async generation tracking', 'Zip export for handoff'].map((item) => (
                <div key={item} className="border-2 border-black bg-white px-4 py-3 text-sm font-bold uppercase shadow-hard-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <Card className="gap-0 overflow-hidden bg-white p-0">
            <div className="border-b-2 border-black bg-secondary px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-black/70">Launch workflow</p>
                  <h2 className="mt-2 text-3xl font-black uppercase leading-none">From source file to ecommerce scene</h2>
                </div>
                <div className="hidden h-14 w-14 items-center justify-center border-2 border-black bg-white shadow-hard-sm sm:flex">
                  <Images className="h-7 w-7" />
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-6">
              {workflowSteps.map((step, index) => (
                <div key={step} className="flex gap-4 border-2 border-black bg-background p-4 shadow-hard-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-white text-sm font-black">
                    0{index + 1}
                  </div>
                  <p className="text-base font-medium leading-7">{step}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {featureCards.map((feature) => {
            const Icon = feature.icon;

            return (
              <Card key={feature.title} className={`${feature.tone} gap-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center border-2 border-black bg-white text-black shadow-hard-sm">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-black">
                    Feature
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black uppercase leading-tight">{feature.title}</h3>
                  <p className="text-base font-medium leading-7 opacity-90">{feature.body}</p>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="bg-primary text-primary-foreground">
            <p className="text-sm font-black uppercase tracking-[0.25em] opacity-80">Who it is for</p>
            <h2 className="text-3xl font-black uppercase leading-tight">
              Teams shipping apparel imagery at catalog speed
            </h2>
            <p className="text-lg font-medium leading-8 opacity-95">
              Use it for marketplace listings, seasonal drops, catalog refreshes, and internal merchandising previews when you need consistent lifestyle-style outputs fast.
            </p>
          </Card>

          <Card className="bg-white">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-muted-foreground">What you control</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {[
                'Demographic selection across baby, kids, and adults',
                'Single-age or age-range targeting',
                'Automated background variety across the batch',
                'Per-image retry handling before export',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 border-2 border-black bg-background p-4 shadow-hard-sm">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 border-black bg-secondary">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm font-bold leading-6 uppercase">{item}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
