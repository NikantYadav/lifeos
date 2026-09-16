export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; locked?: string }>;
}) {
  const { error, locked } = await searchParams;

  return (
    <div className="login-wrap">
      <form className="login-card" method="post" action="/api/login">
        <h1>Life OS</h1>
        {error && <p className="login-error">Wrong email or password.</p>}
        {locked && <p className="login-error">Too many attempts. Try again in a few minutes.</p>}
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        <label className="lbl" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn" type="submit">Sign in</button>
      </form>
    </div>
  );
}
