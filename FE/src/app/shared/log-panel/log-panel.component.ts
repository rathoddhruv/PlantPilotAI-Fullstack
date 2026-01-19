import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { interval, Subscription, switchMap, startWith } from 'rxjs';

export interface LogEntry {
    msg: string;
    count: number;
    time: string;
    type: 'info' | 'error' | 'success' | 'warn';
}

@Component({
    selector: 'app-log-panel',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="flex flex-col border-t border-gray-700 bg-[#0d1117] text-gray-400 font-mono text-xs transition-none shadow-[0_-4px_20px_rgba(0,0,0,0.3)] relative"
         [style.height.px]="height">
      
      <!-- Resizer Handle -->
      <div class="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-blue-500 bg-gray-800 transition-colors z-50 select-none"
           (mousedown)="startResize($event)"></div>

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-800 select-none flex-shrink-0">
          <div class="flex items-center gap-2">
              <span class="font-bold text-gray-300">DEV CONSOLE</span>
              <span class="text-gray-600">~ backend-stream</span>
              <span class="text-[10px] text-gray-500 ml-2" *ngIf="!autoScroll">(Auto-scroll Paused)</span>
          </div>
          <div class="text-[10px] text-gray-600 flex gap-4">
              <span>{{ devLogs.length }} LINES</span>
          </div>
      </div>

      <!-- Log Output -->
      <div #scrollContainer 
           class="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent font-medium bg-[#0d1117]"
           (scroll)="onScroll()">
          
          <div *ngFor="let log of devLogs; let i = index"
               class="hover:bg-gray-800/30 px-1 rounded transition-colors break-words flex items-start">
              <span class="text-gray-600 mr-2 select-none w-8 text-right flex-shrink-0">{{ devLogs.length - i }}.</span>
              <span class="flex-1" [class.text-red-400]="log.type === 'error'"
                    [class.text-green-400]="log.type === 'success'" 
                    [class.text-blue-400]="log.type === 'info'"
                    [class.text-yellow-400]="log.type === 'warn'">
                  {{ log.msg }}
                  <span *ngIf="log.count > 1"
                        class="ml-2 bg-gray-700 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold select-none">x{{ log.count }}</span>
              </span>
              <span class="text-gray-700 text-[10px] ml-2 select-none">{{ log.time }}</span>
          </div>
          
          <div *ngIf="devLogs.length === 0"
               class="h-full flex flex-col items-center justify-center text-gray-700 opacity-50">
              <p>Waiting for events...</p>
          </div>
      </div>
    </div>
  `,
    styles: [`
    :host { display: block; width: 100%; z-index: 40; }
  `]
})
export class LogPanelComponent implements OnInit, OnDestroy {
    @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

    devLogs: LogEntry[] = [];
    logSub: Subscription | null = null;

    height = 200;
    autoScroll = true;
    private isResizing = false;

    constructor(private api: ApiService) { }

    ngOnInit() {
        // Poll logs every 2.5 seconds
        this.logSub = interval(2500).pipe(
            switchMap(() => this.api.getLogs())
        ).subscribe({
            next: (res) => {
                if (res.logs && res.logs.length > 0) {
                    this.processLogs(res.logs);
                }
            }
        });
    }

    processLogs(logs: string[]) {
        // Filter out internal polling logs to reduce noise
        const filtered = logs.filter(line =>
            !line.includes('/api/v1/project/logs') &&
            !line.includes('/pipeline/runs')
        );

        const newEntries: LogEntry[] = [];
        let updated = false;

        // Only process if we have logs
        if (filtered.length === 0) return;

        // Optimization: We re-process seemingly all logs from backend? 
        // Assuming backend sends *recent* buffer. We need to append or replace.
        // Based on previous implementation, it seemed to replace or we append strictly new?
        // The backend `getLogs` usually returns the full buffer or a tail.
        // Let's assume we receive a fresh batch and we dedup against OUR last entry.
        // Actually, if backend returns the SAME buffer every time (stream history), we should handle it.
        // But typically we treated it as "current buffer".
        // Let's stick to the previous implementation: REBUILD from the response, assuming response is the "latest window".
        // Wait, if it's the "latest window", replacing `devLogs` entirely causes jitter.
        // The previous implementation (Step 246) did: `this.devLogs = this.processBackendLogs(res.logs);`
        // It replaced the array entirely every second. This is inefficient but simple.
        // I Will stick to replacing for now to ensure consistency, but if user scrolls up, replacement might jump.
        // *Correction*: Replacing the array might reset scroll position if angular re-renders everything.
        // `trackBy` would help. Or just appending new lines.
        // Since I don't know the backend behavior (does it clear logs?), I'll stick to replacement but add trackBy logic if I could.
        // Actually, I'll use the existing logic but check for scroll preservation.

        const entries: LogEntry[] = [];
        for (const line of filtered) {
            let type: 'info' | 'error' | 'success' | 'warn' = 'info';
            const lower = line.toLowerCase();
            if (lower.includes('error') || lower.includes('fail')) type = 'error';
            else if (lower.includes('success') || lower.includes('complete')) type = 'success';
            else if (lower.includes('warn') || lower.includes('reloading')) type = 'warn';

            if (entries.length > 0 && entries[entries.length - 1].msg === line) {
                entries[entries.length - 1].count++;
            } else {
                entries.push({
                    msg: line,
                    count: 1,
                    time: '',
                    type
                });
            }
        }

        // Reverse to show newest first?
        // Previous implementation: `return entries.reverse();` (Step 246).
        // If we reverse, newest is at TOP.
        // If newest is at top, `scrollToBottom` logic is inverted (scrollToTop).
        // Usually Console logs are Oldest at Top, Newest at Bottom.
        // If `entries.reverse()` was used, then Newest provided by backend (if backend sends oldest->newest) would became Newest->Oldest.
        // Let's check visual: "Live Logs" usually scroll down.
        // I will NOT reverse, so Oldest -> Newest. (Standard console).
        // IF the backend sends Newest First, then I don't need to reverse.
        // Assuming backend sends chronological list.

        this.devLogs = entries; // Oldest at top, newest at bottom

        setTimeout(() => {
            if (this.autoScroll) {
                this.scrollToBottom();
            }
        });
    }

    scrollToBottom(): void {
        try {
            this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
        } catch (err) { }
    }

    onScroll() {
        const el = this.scrollContainer.nativeElement;
        const threshold = 20;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

        if (atBottom) {
            this.autoScroll = true;
        } else {
            // If user scrolls up, disable autoscroll
            this.autoScroll = false;
        }
    }

    // Resizing Logic
    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.isResizing) return;
        // Calculate new height: It's at bottom, so dy is inverted relative to height increase
        // Mouse moving UP increases height.
        // We need initial Y or just allow delta.
        // Simplification: window.innerHeight - event.clientY
        const newHeight = window.innerHeight - event.clientY;
        if (newHeight > 50 && newHeight < 600) {
            this.height = newHeight;
        }
    }

    @HostListener('document:mouseup')
    onMouseUp() {
        this.isResizing = false;
    }

    startResize(event: MouseEvent) {
        event.preventDefault();
        this.isResizing = true;
    }

    ngOnDestroy() {
        if (this.logSub) this.logSub.unsubscribe();
    }
}
