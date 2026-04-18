import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../../core/services/api.service';

@Component({
  selector: 'app-training-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full bg-gray-900 border-r border-gray-800 p-6 flex flex-col h-full text-gray-300">
      <div class="mb-8">
        <h2 class="text-xl font-black text-white mb-1 uppercase tracking-tighter italic whitespace-nowrap">TrainFlow Vision</h2>
        <p class="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest">Global Training & Refine Hub</p>
      </div>

      <div class="flex-1 overflow-y-auto pr-1">
        <h3 class="text-[10px] font-black text-gray-500 uppercase mb-4 tracking-widest border-b border-gray-800 pb-2">Neural History</h3>
        <div class="space-y-2">
          <div *ngFor="let run of runs" class="rounded-xl border transition-all"
               [ngClass]="run.kind === 'current' ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-gray-800 bg-gray-800/30'">
            <div class="flex items-center justify-between p-3" (click)="toggleRun(run.name)">
               <div class="flex items-center gap-2">
                  <div class="flex flex-col">
                    <span class="text-[9px] font-mono font-black text-indigo-400/70 uppercase tracking-tighter">{{ run.name }}</span>
                    <span class="text-[10px] font-black tracking-widest text-white/90">{{ run.mtime * 1000 | date:'MMM d h:mm a' }}</span>
                  </div>
               </div>
               <span class="text-gray-600 text-[10px]" [class.rotate-180]="expandedRuns.has(run.name)">▼</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class TrainingSidebarComponent {
  @Input() runs: RunInfo[] = [];
  public expandedRuns = new Set<string>();

  constructor(private api: ApiService) {}

  public toggleRun(name: string) {
    if (this.expandedRuns.has(name)) {
      this.expandedRuns.delete(name);
    } else {
      this.expandedRuns.add(name);
    }
  }
}
