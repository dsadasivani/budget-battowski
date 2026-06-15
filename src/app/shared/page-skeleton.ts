import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PageSkeletonVariant =
  | 'dashboard'
  | 'expenses'
  | 'planning'
  | 'investments'
  | 'loans'
  | 'categories'
  | 'utility';

type PageSkeletonConfig = {
  stats: number;
  rows: number;
  sidePanels: number;
  mode: 'lists' | 'table' | 'cards' | 'utility';
};

const CONFIG: Record<PageSkeletonVariant, PageSkeletonConfig> = {
  dashboard: { stats: 5, rows: 3, sidePanels: 2, mode: 'lists' },
  expenses: { stats: 3, rows: 6, sidePanels: 2, mode: 'table' },
  planning: { stats: 3, rows: 6, sidePanels: 2, mode: 'lists' },
  investments: { stats: 3, rows: 6, sidePanels: 2, mode: 'table' },
  loans: { stats: 4, rows: 3, sidePanels: 2, mode: 'lists' },
  categories: { stats: 3, rows: 10, sidePanels: 0, mode: 'cards' },
  utility: { stats: 0, rows: 3, sidePanels: 0, mode: 'utility' },
};

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

@Component({
  selector: 'app-page-skeleton',
  template: `
    <section
      class="page-skeleton"
      [class.card-mode]="config().mode === 'cards'"
      [class.utility-mode]="config().mode === 'utility'"
      aria-busy="true"
      aria-label="Loading page data"
    >
      <span class="sr-only">Loading page data</span>

      <div class="desktop-skeleton" aria-hidden="true">
        <header class="skeleton-header">
          <div>
            <span class="sk-line sk-title"></span>
            <span class="sk-line sk-subtitle"></span>
          </div>
          <span class="sk-pill"></span>
        </header>

        @if (statItems().length) {
          <section class="skeleton-stats">
            @for (item of statItems(); track item) {
              <article class="sk-card sk-stat">
                <span class="sk-box sk-icon"></span>
                <span class="sk-line short"></span>
                <span class="sk-line value"></span>
                <span class="sk-line tiny"></span>
              </article>
            }
          </section>
        }

        @if (config().mode === 'cards') {
          <section class="skeleton-card-grid">
            @for (item of rowItems(); track item) {
              <article class="sk-card sk-category">
                <span class="sk-box sk-icon"></span>
                <span class="sk-line title-line"></span>
                <span class="sk-line short"></span>
                <span class="sk-line progress"></span>
              </article>
            }
          </section>
        } @else if (config().mode === 'utility') {
          <section class="skeleton-utility-grid">
            @for (item of rowItems(); track item) {
              <article class="sk-card sk-utility">
                <span class="sk-box sk-icon"></span>
                <span class="sk-line title-line"></span>
                <span class="sk-line paragraph"></span>
                <span class="sk-pill button"></span>
              </article>
            }
          </section>
        } @else {
          <section class="skeleton-body">
            <article class="sk-card sk-main-panel">
              <div class="panel-top">
                <div>
                  <span class="sk-line title-line"></span>
                  <span class="sk-line paragraph"></span>
                </div>
                <span class="sk-pill action"></span>
              </div>

              @if (config().mode === 'table') {
                <div class="sk-table">
                  <span class="sk-table-head"></span>
                  @for (item of rowItems(); track item) {
                    <span class="sk-table-row"></span>
                  }
                </div>
              } @else {
                <div class="sk-list">
                  @for (item of rowItems(); track item) {
                    <span class="sk-list-row"></span>
                  }
                </div>
              }
            </article>

            <aside class="skeleton-side-stack">
              @for (item of sideItems(); track item) {
                <article class="sk-card sk-side-panel">
                  <span class="sk-line title-line"></span>
                  <span class="sk-line paragraph"></span>
                  <span class="sk-donut"></span>
                  <span class="sk-line progress"></span>
                  <span class="sk-line progress short-progress"></span>
                </article>
              }
            </aside>
          </section>
        }
      </div>

      <div class="mobile-skeleton" aria-hidden="true">
        <header class="mobile-sk-hero">
          <span class="sk-line mobile-title"></span>
          <span class="sk-pill mobile-action"></span>
        </header>
        <span class="mobile-control"></span>

        @if (statItems().length) {
          <section class="mobile-sk-stats">
            @for (item of statItems(); track item) {
              <article class="sk-card mobile-sk-stat">
                <span class="sk-box sk-icon"></span>
                <span class="sk-line short"></span>
                <span class="sk-line value"></span>
              </article>
            }
          </section>
        }

        <section class="mobile-sk-panels">
          @for (panel of mobilePanelItems(); track panel) {
            <article class="sk-card mobile-sk-panel">
              <span class="sk-line mobile-panel-title"></span>
              <span class="sk-line mobile-panel-subtitle"></span>
              <span class="mobile-sk-block"></span>
            </article>
          }
        </section>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: min(1420px, 100%);
      }

      .page-skeleton {
        display: block;
        width: 100%;
      }

      .utility-mode {
        width: min(1120px, 100%);
      }

      .desktop-skeleton,
      .mobile-skeleton {
        width: 100%;
      }

      .mobile-skeleton {
        display: none;
      }

      .skeleton-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 22px;
        margin-bottom: 26px;
      }

      .skeleton-header > div,
      .panel-top > div {
        display: grid;
        min-width: 0;
        gap: 10px;
      }

      .skeleton-stats,
      .skeleton-body,
      .skeleton-card-grid,
      .skeleton-utility-grid {
        display: grid;
        gap: 18px;
      }

      .skeleton-stats {
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        margin-bottom: 18px;
      }

      .skeleton-body {
        grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.9fr);
      }

      .skeleton-side-stack {
        display: grid;
        align-content: start;
        gap: 18px;
      }

      .skeleton-card-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .skeleton-utility-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .sk-card {
        min-width: 0;
        border: 1px solid #e0e7f1;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.07);
      }

      .sk-stat {
        display: grid;
        min-height: 126px;
        align-content: start;
        gap: 14px;
        padding: 20px;
      }

      .sk-main-panel {
        min-height: 580px;
        padding: 24px;
      }

      .sk-side-panel {
        display: grid;
        min-height: 300px;
        justify-items: start;
        gap: 14px;
        padding: 24px;
      }

      .sk-category,
      .sk-utility {
        display: grid;
        min-height: 178px;
        gap: 14px;
        padding: 22px;
      }

      .panel-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 28px;
      }

      .sk-list,
      .sk-table {
        display: grid;
        overflow: hidden;
        border: 1px solid #e0e7f1;
        border-radius: 8px;
      }

      .sk-list {
        gap: 0;
        border: 0;
      }

      .sk-list-row,
      .sk-table-row,
      .sk-table-head {
        display: block;
        min-height: 70px;
        border-bottom: 1px solid #e6ebf2;
      }

      .sk-table-head {
        min-height: 48px;
        background-color: #f8fafc;
      }

      .sk-table-row:last-child,
      .sk-list-row:last-child {
        border-bottom: 0;
      }

      .sk-line,
      .sk-pill,
      .sk-box,
      .sk-donut,
      .mobile-control,
      .sk-list-row,
      .sk-table-row,
      .sk-table-head {
        background: linear-gradient(100deg, #e7edf5 8%, #f8fbff 20%, #e7edf5 36%);
        background-size: 220% 100%;
        animation: page-skeleton-shimmer 1.35s ease-in-out infinite;
      }

      .sk-line,
      .sk-pill {
        display: block;
        border-radius: 999px;
      }

      .sk-title {
        width: min(360px, 52vw);
        height: 36px;
      }

      .sk-subtitle {
        width: min(520px, 60vw);
        height: 18px;
      }

      .sk-pill {
        width: 210px;
        height: 44px;
      }

      .sk-pill.button {
        width: 180px;
      }

      .sk-pill.action {
        width: 230px;
      }

      .sk-box.sk-icon {
        width: 48px;
        height: 48px;
        border-radius: 8px;
      }

      .short {
        width: 110px;
        height: 18px;
      }

      .value {
        width: 150px;
        height: 30px;
      }

      .tiny {
        width: 90px;
        height: 14px;
      }

      .title-line {
        width: min(220px, 70%);
        height: 24px;
      }

      .paragraph {
        width: min(360px, 86%);
        height: 16px;
      }

      .progress {
        width: 82%;
        height: 12px;
      }

      .short-progress {
        width: 58%;
      }

      .sk-donut {
        display: block;
        width: 170px;
        height: 170px;
        place-self: center;
        margin-block: 18px;
        border-radius: 50%;
      }

      @media (max-width: 1280px) {
        .skeleton-body {
          grid-template-columns: 1fr;
        }

        .skeleton-card-grid,
        .skeleton-utility-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 780px) {
        :host {
          width: 100%;
        }

        .desktop-skeleton {
          display: none;
        }

        .mobile-skeleton {
          display: grid;
          gap: 12px;
          width: 100%;
          overflow: hidden;
          padding: 0 12px 14px;
        }

        .mobile-sk-hero {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 12px;
          min-height: 74px;
          margin: 0 -12px;
          overflow: hidden;
          padding: 20px 16px;
          background: #10213f;
        }

        .mobile-title {
          width: 58vw;
          height: 28px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: linear-gradient(100deg, #1e3357 8%, #2a426a 20%, #1e3357 36%);
          background-size: 220% 100%;
        }

        .mobile-action {
          width: 34vw;
          height: 40px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: linear-gradient(100deg, #1e3357 8%, #2a426a 20%, #1e3357 36%);
          background-size: 220% 100%;
        }

        .mobile-control {
          display: block;
          width: min(240px, 66vw);
          height: 36px;
          margin-top: 8px;
          border-radius: 999px;
        }

        .mobile-sk-stats {
          display: grid;
          grid-auto-columns: minmax(142px, calc((100vw - 34px) / 2));
          grid-auto-flow: column;
          gap: 10px;
          overflow-x: auto;
          margin-right: -12px;
          padding-right: 12px;
          scrollbar-width: none;
        }

        .mobile-sk-stats::-webkit-scrollbar {
          display: none;
        }

        .mobile-sk-stat {
          display: grid;
          min-height: 94px;
          align-content: start;
          gap: 8px;
          padding: 14px;
        }

        .mobile-sk-panels {
          display: grid;
          gap: 12px;
          margin-top: 0;
        }

        .mobile-sk-panel {
          display: grid;
          min-height: clamp(300px, 42vh, 420px);
          align-content: start;
          gap: 12px;
          overflow: hidden;
          padding: 18px;
        }

        .sk-box.sk-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
        }

        .short {
          width: min(92px, 68%);
          height: 12px;
        }

        .value {
          width: min(118px, 82%);
          height: 22px;
        }

        .title-line {
          width: 75%;
          height: 20px;
        }

        .paragraph {
          width: 88%;
          height: 14px;
        }

        .mobile-panel-title {
          width: min(240px, 74%);
          height: 18px;
        }

        .mobile-panel-subtitle {
          width: min(320px, 88%);
          height: 14px;
        }

        .mobile-sk-block {
          display: block;
          position: relative;
          min-height: clamp(210px, 30vh, 310px);
          overflow: hidden;
          border-radius: 8px;
          background: linear-gradient(100deg, #e7edf5 8%, #f8fbff 20%, #e7edf5 36%);
          background-size: 220% 100%;
          animation: page-skeleton-shimmer 1.35s ease-in-out infinite;
        }

        .mobile-sk-block::after {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 68px,
            rgba(203, 213, 225, 0.42) 69px,
            transparent 70px
          );
          content: '';
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .sk-line,
        .sk-pill,
        .sk-box,
        .sk-donut,
        .mobile-control,
        .mobile-sk-block,
        .sk-list-row,
        .sk-table-row,
        .sk-table-head {
          animation: none;
          background: #e7edf5;
        }
      }

      @keyframes page-skeleton-shimmer {
        0% {
          background-position: 120% 0;
        }

        100% {
          background-position: -120% 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppPageSkeletonComponent {
  readonly variant = input.required<PageSkeletonVariant>();
  readonly config = computed(() => CONFIG[this.variant()]);
  readonly statItems = computed(() => range(this.config().stats));
  readonly rowItems = computed(() => range(this.config().rows));
  readonly sideItems = computed(() => range(this.config().sidePanels));
  readonly mobilePanelItems = computed(() => range(1));
}
