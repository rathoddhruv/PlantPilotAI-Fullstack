import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PredictionResult } from './api.service';

export interface ReviewItem {
    id: string;
    file: File;
    status: 'pending' | 'accepted' | 'rejected' | 'analyzing' | 'error';
    prediction?: PredictionResult;
    error?: string;
}

@Injectable({
    providedIn: 'root'
})
export class ReviewQueueService {
    private queue: ReviewItem[] = [];
    private currentIndex = -1;

    public currentItem$ = new BehaviorSubject<ReviewItem | null>(null);
    public queueStats$ = new BehaviorSubject<{ current: number, total: number }>({ current: 0, total: 0 });

    constructor() { }

    addFiles(files: File[]) {
        const newItems: ReviewItem[] = Array.from(files).map(f => ({
            id: Math.random().toString(36).substring(7),
            file: f,
            status: 'pending'
        }));
        this.queue.push(...newItems);

        if (this.currentIndex === -1 && this.queue.length > 0) {
            this.currentIndex = 0;
            this.emitState();
        } else {
            this.emitState();
        }
    }

    clear() {
        this.queue = [];
        this.currentIndex = -1;
        this.emitState();
    }

    next() {
        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex++;
            this.emitState();
        }
    }

    previous() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.emitState();
        }
    }

    updateCurrentItem(update: Partial<ReviewItem>) {
        if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
            this.queue[this.currentIndex] = { ...this.queue[this.currentIndex], ...update };
            this.emitState();
        }
    }

    hasMultiple(): boolean {
        return this.queue.length > 1;
    }

    getQueue() {
        return this.queue;
    }

    private emitState() {
        const item = this.currentIndex >= 0 ? this.queue[this.currentIndex] : null;
        this.currentItem$.next(item);
        this.queueStats$.next({
            current: this.currentIndex + 1,
            total: this.queue.length
        });
    }
}
