export type SecretRowProps = {
  name: string;
  value: string;
  lastSynced?: string;
};

export const SecretRow = ({ name, value, lastSynced }: SecretRowProps) => (
  <div class="secret-row" data-secret-row>
    <div class="secret-row-info">
      <span class="secret-row-name">{name}</span>
      <span class="secret-row-synced">{lastSynced ? `synced ${lastSynced}` : 'not synced yet'}</span>
    </div>
    <div class="secret-row-value" data-secret-value-container>
      <span data-secret-masked>
        <span class="secret-masked">
          {Array.from({ length: 3 }).map(() => (
            <span class="secret-masked-group">
              {Array.from({ length: 4 }).map(() => (
                <span class="secret-masked-dot" />
              ))}
            </span>
          ))}
        </span>
      </span>
      <span data-secret-plaintext style="display:none">{value}</span>
      <button
        type="button"
        class="secret-action"
        data-secret-reveal
        title="Reveal value"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3l18 18" />
          <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      </button>
      <button
        type="button"
        class="secret-action"
        data-secret-copy
        title="Copy value"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      </button>
    </div>
  </div>
);
