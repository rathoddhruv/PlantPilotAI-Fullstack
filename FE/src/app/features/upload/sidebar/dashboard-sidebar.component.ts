import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, RunInfo } from '../../../core/services/api.service';

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-80 bg-gray-900 border-r border-gray-800 p-6 flex flex-col h-full text-gray-300">
      <!-- Header -->
      <div class="mb-8">
        <h2 class="text-xl font-bold text-white mb-1">Project Status</h2>
        <p class="text-xs text-gray-500 font-mono">System & Model Health</p>
      </div>

      <!-- System Info -->
      <div class="mb-8 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">System</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span>Status</span>
            <span class="text-green-400 font-mono">ONLINE</span>
          </div>
          <div class="flex justify-between">
            <span>CUDA</span>
            <span [class.text-green-400]="sysInfo?.cuda_available" [class.text-gray-500]="!sysInfo?.cuda_available" class="font-mono">
              {{ sysInfo?.cuda_available ? 'ON' : 'OFF' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span>Device</span>
            <span class="text-blue-300 font-mono text-xs">{{ sysInfo?.device_name || 'Loading...' }}</span>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="mb-8">
        <h3 class="text-sm font-bold text-gray-400 uppercase mb-3">Metrics</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-800 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-white">{{ runs.length }}</div>
            <div class="text-xs text-gray-500">Versions</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-green-400">{{ retrainCount }}</div>
            <div class="text-xs text-gray-500">Retrains</div>
          </div>
        </div>
      </div>

      <!-- History / Rollback -->
      <div class="flex-1 overflow-y-auto">
        <h3 class="text-sm font-bold text-gray-400 uppercase mb-3 sticky top-0 bg-gray-900 py-2">History</h3>
        <div class="space-y-3">
          <div *ngFor="let run of runs" class="p-3 rounded-lg border transition-all"
               [class.border-green-500]="run.kind === 'current'"
               [class.bg-green-900_10]="run.kind === 'current'"
               [class.border-gray-700]="run.kind !== 'current'"
               [class.bg-gray-800]="run.kind !== 'current'">
            
            <div class="flex justify-between items-start mb-1">
              <span class="font-mono text-xs font-bold" [class.text-green-400]="run.kind === 'current'">
                {{ run.name }}
              </span>
              <span *ngIf="run.kind === 'current'" class="text-[10px] bg-green-500 text-black px-1.5 rounded font-bold">ACTIVE</span>
            </div>
            
            <p class="text-xs text-gray-500 mb-2">Updated: {{ run.mtime * 1000 | date:'short' }}</p>
            
            <button *ngIf="run.kind !== 'current'" (click)="rollback(run.name)" 
                    class="w-full py-1 text-xs border border-gray-600 rounded hover:bg-gray-700 text-gray-400 transition-colors">
              Rollback to this
            </button>
          </div>
        </div>
      </div>

    </div>
  `
})
export class DashboardSidebarComponent implements OnInit {
  @Input() runs: RunInfo[] = [];
  @Input() manifest: any[] = []; // Used to calc stats

  sysInfo: any = null;

  constructor(private api: ApiService) { }

  ngOnInit() {
    this.api.getSystemInfo().subscribe(res => {
      this.sysInfo = res;
    });
  }

  get retrainCount(): number {
    return this.manifest ? this.manifest.filter(e => e.event === 'active_learning_train').length : 0;
  }

  rollback(runName: string) {
    if (!confirm(`Are you sure you want to rollback to ${runName}?`)) return;
    this.api.rollback(runName).subscribe({
      next: () => alert('Rollback successful. Model updated.'),
      error: (e) => alert('Rollback failed: ' + e.message)
    });
  }
}
