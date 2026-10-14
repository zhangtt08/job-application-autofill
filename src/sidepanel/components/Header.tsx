export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <header className="header">
      <div className="header-title">网申助手</div>
      {subtitle && <div className="header-sub">{subtitle}</div>}
    </header>
  );
}
