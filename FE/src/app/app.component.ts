import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { DashboardSidebarComponent } from './features/upload/sidebar/dashboard-sidebar.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { LogPanelComponent } from './shared/log-panel/log-panel.component';
import { ApiService, RunInfo } from './core/services/api.service';
import { interval, startWith, switchMap } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, DashboardSidebarComponent, ToastComponent, LogPanelComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'plant-pilot';
  isConsoleVisible = false;

  // Splitter State
  sidebarWidth = 320;
  consoleHeight = 300;
  isResizingSidebar = false;
  isResizingConsole = false;

  // Data State
  runs: RunInfo[] = [];
  manifest: any[] = [];

  constructor(private api: ApiService) { }

  ngOnInit() {
    // Global data polling for sidebar
    interval(5000).pipe(
      startWith(0),
      switchMap(() => this.api.getRuns())
    ).subscribe({
      next: (res) => {
        this.runs = res.runs;
        this.manifest = res.manifest;
      }
    });
  }

  toggleConsole() {
    this.isConsoleVisible = !this.isConsoleVisible;
  }

  // --- Splitter Logic ---
  startResizingSidebar(event: MouseEvent) {
    event.preventDefault();
    this.isResizingSidebar = true;
  }

  startResizingConsole(event: MouseEvent) {
    event.preventDefault();
    this.isResizingConsole = true;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isResizingSidebar) {
      const newWidth = event.clientX;
      if (newWidth > 200 && newWidth < 600) {
        this.sidebarWidth = newWidth;
      }
    }

    if (this.isResizingConsole) {
      const newHeight = window.innerHeight - event.clientY;
      if (newHeight > 40 && newHeight < 800) {
        this.consoleHeight = newHeight;
      }
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isResizingSidebar = false;
    this.isResizingConsole = false;
  }
}
