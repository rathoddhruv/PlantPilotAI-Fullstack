/**
 * Root Application State
 * Defines the structure of the global application state managed by NGRX
 */

export interface Detection {
    class: string;
    confidence: number;
    box: number[];
    poly?: number[];
}

export interface BatchQueueItem {
    filename: string;
    detections: Detection[];
    width: number;
    height: number;
    label_type: 'correct' | 'false_positive' | 'false_negative' | 'low_confidence';
    timestamp: string;
}

export interface TrainingRun {
    name: string;
    kind: string;
    epoch?: number;
    images?: number;
    mAP?: number;
    timestamp?: string;
}

export interface ModelState {
    currentModel: string;
    classes: string[];
    isLoading: boolean;
    error: string | null;
}

export interface BatchState {
    queue: BatchQueueItem[];
    status: 'idle' | 'queued' | 'processing';
    maxBatchSize: number;
    isProcessing: boolean;
}

export interface TrainingState {
    isTraining: boolean;
    currentRun: TrainingRun | null;
    runs: TrainingRun[];
    progress: number;
    logs: string[];
    error: string | null;
    startTime: Date | null;
}

export interface ProjectState {
    isInitialized: boolean;
    pendingImages: string[];
    stagedStats: {
        images: number;
        classes: number;
    };
    isLoading: boolean;
    error: string | null;
}

export interface AppState {
    model: ModelState;
    batch: BatchState;
    training: TrainingState;
    project: ProjectState;
}
