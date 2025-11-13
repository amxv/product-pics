import type { RunpodSubmitRequest, RunpodSubmitResponse, RunpodStatusResponse } from './types';

// RunPod configuration
const RUNPOD_ENDPOINT = 'https://api.runpod.ai/v2/nano-banana-edit';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY!;

/**
 * Submit job to RunPod for image generation
 * @param input - Job input parameters (prompt, images, size, etc.)
 * @returns Job ID
 */
export async function submitJob(input: RunpodSubmitRequest['input']): Promise<string> {
  try {
    const response = await fetch(`${RUNPOD_ENDPOINT}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RunPod API error (${response.status}): ${errorText}`);
    }

    const data: RunpodSubmitResponse = await response.json();
    return data.id;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to submit job to RunPod: ${error.message}`);
    }
    throw new Error('Failed to submit job to RunPod: Unknown error');
  }
}

/**
 * Get job status from RunPod
 * @param jobId - RunPod job ID
 * @returns Job status response
 */
export async function getJobStatus(jobId: string): Promise<RunpodStatusResponse> {
  try {
    const response = await fetch(`${RUNPOD_ENDPOINT}/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RunPod API error (${response.status}): ${errorText}`);
    }

    const data: RunpodStatusResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get job status from RunPod: ${error.message}`);
    }
    throw new Error('Failed to get job status from RunPod: Unknown error');
  }
}

/**
 * Download result image from RunPod CDN
 * @param resultUrl - URL to the generated image
 * @returns Image buffer
 */
export async function downloadResult(resultUrl: string): Promise<Buffer> {
  try {
    const response = await fetch(resultUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to download result from RunPod CDN: ${error.message}`);
    }
    throw new Error('Failed to download result from RunPod CDN: Unknown error');
  }
}
