import { createReducer, on } from '@ngrx/store';
import { BatchState } from '../app.state';
import * as BatchActions from './batch.actions';

export const initialState: BatchState = {
    queue: [],
    status: 'idle',
    maxBatchSize: 20,
    isProcessing: false
};

export const batchReducer = createReducer(
    initialState,

    // Queue Annotation
    on(BatchActions.queueAnnotation, (state, { filename, detections, width, height, labelType }) => ({
        ...state,
        queue: [
            ...state.queue.filter(item => item.filename !== filename),
            {
                filename,
                detections,
                width,
                height,
                label_type: labelType,
                timestamp: new Date().toISOString()
            }
        ],
        status: 'queued' as const
    })),

    // Reject Annotation
    on(BatchActions.rejectAnnotation, (state, { filename }) => ({
        ...state,
        queue: state.queue.filter(item => item.filename !== filename),
        status: 'idle' as const
    })),

    // Get Batch Status
    on(BatchActions.getBatchStatusSuccess, (state, { queueSize, maxBatchSize }) => ({
        ...state,
        maxBatchSize
    })),

    // Accept Batch
    on(BatchActions.acceptBatch, (state) => ({
        ...state,
        isProcessing: true,
        status: 'processing' as const
    })),

    on(BatchActions.acceptBatchSuccess, (state) => ({
        ...state,
        queue: [],
        isProcessing: false,
        status: 'idle' as const
    })),

    on(BatchActions.acceptBatchFailure, (state) => ({
        ...state,
        isProcessing: false,
        status: 'idle' as const
    })),

    // Clear Batch
    on(BatchActions.clearBatch, () => initialState)
);
