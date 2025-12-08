import { Injectable } from '@angular/core';

export interface QueuedImage {
    file: File;
    url: string;
    prediction?: any;
}

@Injectable({
    providedIn: 'root'
})
export class ImageQueueService {
    private queue: QueuedImage[] = [];
    private currentIndex = 0;
    private maxSize = 20;

    addImages(files: File[]) {
        const availableSlots = this.maxSize - this.queue.length;
        const filesToAdd = files.slice(0, availableSlots);

        for (const file of filesToAdd) {
            this.queue.push({
                file,
                url: URL.createObjectURL(file)
            });
        }

        return filesToAdd.length;
    }

    getQueue(): QueuedImage[] {
        return this.queue;
    }

    getCurrentImage(): QueuedImage | null {
        return this.queue[this.currentIndex] || null;
    }

    getCurrentIndex(): number {
        return this.currentIndex;
    }

    getTotalCount(): number {
        return this.queue.length;
    }

    hasNext(): boolean {
        return this.currentIndex < this.queue.length - 1;
    }

    hasPrevious(): boolean {
        return this.currentIndex > 0;
    }

    next(): QueuedImage | null {
        if (this.hasNext()) {
            this.currentIndex++;
            return this.getCurrentImage();
        }
        return null;
    }

    previous(): QueuedImage | null {
        if (this.hasPrevious()) {
            this.currentIndex--;
            return this.getCurrentImage();
        }
        return null;
    }

    setPrediction(index: number, prediction: any) {
        if (this.queue[index]) {
            this.queue[index].prediction = prediction;
        }
    }

    removeCurrentAndAdvance(): QueuedImage | null {
        if (this.queue.length === 0) return null;

        // Remove current
        this.queue.splice(this.currentIndex, 1);

        // Adjust index if needed
        if (this.currentIndex >= this.queue.length && this.queue.length > 0) {
            this.currentIndex = this.queue.length - 1;
        }

        return this.getCurrentImage();
    }

    clear() {
        // Revoke object URLs to prevent memory leaks
        this.queue.forEach(img => URL.revokeObjectURL(img.url));
        this.queue = [];
        this.currentIndex = 0;
    }

    reset() {
        this.clear();
    }
}
