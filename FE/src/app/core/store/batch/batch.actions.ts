import { createAction, props } from '@ngrx/store';
import { BatchQueueItem, Detection } from '../app.state';

// Queue Annotation
export const queueAnnotation = createAction(
    '[Batch] Queue Annotation',
    props<{
        filename: string;
        detections: Detection[];
        width: number;
        height: number;
        labelType: 'correct' | 'false_positive' | 'false_negative' | 'low_confidence';
    }>()
);

// Reject Annotation
export const rejectAnnotation = createAction(
    '[Batch] Reject Annotation',
    props<{ filename: string }>()
);

// Get Batch Status
export const getBatchStatus = createAction(
    '[Batch] Get Status'
);

export const getBatchStatusSuccess = createAction(
    '[Batch] Get Status Success',
    props<{ items: BatchQueueItem[]; queueSize: number; maxBatchSize: number }>()
);

// Accept Batch
export const acceptBatch = createAction(
    '[Batch] Accept All',
    props<{ epochs?: number; imgsz?: number; model?: string }>()
);

export const acceptBatchSuccess = createAction(
    '[Batch] Accept All Success',
    props<{ message: string; saved: number }>()
);

export const acceptBatchFailure = createAction(
    '[Batch] Accept All Failure',
    props<{ error: string }>()
);

// Clear Batch
export const clearBatch = createAction(
    '[Batch] Clear Queue'
);
