'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { createBatchSchema } from '@/lib/types';
import type { CreateBatchRequest, CreateBatchResponse, Demographic } from '@/lib/types';

const DEMOGRAPHICS: { value: Demographic; label: string }[] = [
  { value: 'baby', label: 'Baby' },
  { value: 'boy', label: 'Boy' },
  { value: 'girl', label: 'Girl' },
];

export function BatchForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateBatchRequest>({
    resolver: zodResolver(createBatchSchema),
    defaultValues: {
      demographic: 'boy',
      ageRange: '',
    },
  });

  const onSubmit = async (data: CreateBatchRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create batch');
      }

      const result: CreateBatchResponse = await response.json();

      // Redirect to batch details page for upload
      router.push(`/batches/${result.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create batch');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-destructive/10 dark:bg-destructive/20 p-4 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <FormField
          control={form.control}
          name="demographic"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Demographic</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select demographic" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {DEMOGRAPHICS.map((demo) => (
                    <SelectItem key={demo.value} value={demo.value}>
                      {demo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Select the demographic for the model in generated photos
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ageRange"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Age Range</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., 5 or 5-8"
                  {...field}
                  disabled={isLoading}
                />
              </FormControl>
              <FormDescription>
                Enter a single age (e.g., &quot;5&quot;) or range (e.g., &quot;5-8&quot;)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? 'Creating...' : 'Create Batch'}
        </Button>
      </form>
    </Form>
  );
}
