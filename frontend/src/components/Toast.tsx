export default function Toast({ message }: { message: string }) {
  return (
    <div className="toast" style={{ display: message ? 'block' : 'none' }}>
      {message}
    </div>
  );
}
