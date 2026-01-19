import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { interval, Subscription, switchMap } from 'rxjs';

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
          <div class="flex items-center gap-4">
              <button (click)="clearLogs()" class="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[10px] text-gray-300 transition-colors">
                  Clear
              </button>
              <div class="text-[10px] text-gray-600 flex gap-4">
                 <span>{{ devLogs.length }} LINES</span>
              </div>
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
        const filtered = logs.filter(line =>
            !line.includes('/api/v1/project/logs') &&
            !line.includes('/pipeline/runs')
        );

        if (filtered.length === 0) return;

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

        this.devLogs = entries;

        setTimeout(() => {
            if (this.autoScroll) {
                this.scrollToBottom();
            }
        });
    }

    clearLogs() {
        this.devLogs = [];
    }

    scrollToBottom(): void {
        try {
            if (this.scrollContainer) {
                this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
            }
        } catch (err) { }
    }

    onScroll() {
        const el = this.scrollContainer.nativeElement;
        const threshold = 20;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

        if (atBottom) {
            this.autoScroll = true;
        } else {
            this.autoScroll = false;
        }
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.isResizing) return;
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
