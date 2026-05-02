import { ChangeEvent, FormEvent, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Property } from '../types';
import { Modal } from './Modal';

const COLORS = ['#FF5A5F', '#00A699', '#FC642D', '#5C6BC0', '#FFB400', '#7B61FF'];

type EditTarget = Property | 'new' | null;

export function Settings() {
  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const [editing, setEditing] = useState<EditTarget>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  const startEdit = (target: Property | 'new') => {
    setEditing(target);
    if (target === 'new') {
      setName('');
      setColor(COLORS[properties.length % COLORS.length]);
    } else {
      setName(target.name);
      setColor(target.color);
    }
  };

  const saveProperty = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing === 'new') {
      await db.properties.add({
        name: name.trim(),
        color,
        createdAt: Date.now(),
      } as Property);
    } else if (editing) {
      await db.properties.update(editing.id!, { name: name.trim(), color });
    }
    setEditing(null);
  };

  const deleteProperty = async (id: number) => {
    if (
      !confirm(
        '이 숙소를 삭제할까요? 관련된 예약과 비용도 함께 삭제됩니다.',
      )
    )
      return;
    await db.transaction(
      'rw',
      db.properties,
      db.bookings,
      db.expenses,
      async () => {
        await db.bookings.where('propertyId').equals(id).delete();
        await db.expenses.where('propertyId').equals(id).delete();
        await db.properties.delete(id);
      },
    );
  };

  const handleExport = async () => {
    const props = await db.properties.toArray();
    const bookings = await db.bookings.toArray();
    const expenses = await db.expenses.toArray();
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      properties: props,
      bookings,
      expenses,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const filename = `airbnb-ledger-${new Date().toISOString().slice(0, 10)}.json`;

    if (typeof navigator.share === 'function') {
      try {
        const file = new File([blob], filename, { type: 'application/json' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: '에어비앤비 가계부 백업',
          });
          return;
        }
      } catch {
        /* fall through */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (
        !confirm(
          '현재 데이터를 모두 덮어쓰고 이 백업으로 복원할까요? 되돌릴 수 없어요.',
        )
      )
        return;
      await db.transaction(
        'rw',
        db.properties,
        db.bookings,
        db.expenses,
        async () => {
          await db.properties.clear();
          await db.bookings.clear();
          await db.expenses.clear();
          if (Array.isArray(data.properties))
            await db.properties.bulkAdd(data.properties);
          if (Array.isArray(data.bookings))
            await db.bookings.bulkAdd(data.bookings);
          if (Array.isArray(data.expenses))
            await db.expenses.bulkAdd(data.expenses);
        },
      );
      alert('복원 완료');
    } catch {
      alert('파일 형식이 올바르지 않아요');
    } finally {
      e.target.value = '';
    }
  };

  const handleClear = async () => {
    if (!confirm('정말 모든 데이터를 삭제할까요? 되돌릴 수 없어요.')) return;
    if (
      !confirm(
        '한 번 더 확인합니다. 모든 숙소, 예약, 비용이 삭제됩니다.',
      )
    )
      return;
    await db.transaction(
      'rw',
      db.properties,
      db.bookings,
      db.expenses,
      async () => {
        await db.properties.clear();
        await db.bookings.clear();
        await db.expenses.clear();
      },
    );
    alert('삭제 완료');
  };

  return (
    <div className="screen">
      <h1>설정</h1>

      <section className="section">
        <h2>숙소</h2>
        <div className="card">
          {properties.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              숙소를 추가해주세요
            </div>
          )}
          {properties.map((p) => (
            <div key={p.id} className="property-row">
              <span className="property-row-name">
                <span className="dot" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="property-row-actions">
                <button className="btn" onClick={() => startEdit(p)}>
                  수정
                </button>
                <button
                  className="btn"
                  style={{ color: 'var(--neg)' }}
                  onClick={() => deleteProperty(p.id!)}
                >
                  삭제
                </button>
              </span>
            </div>
          ))}
          <button
            className="btn primary block"
            onClick={() => startEdit('new')}
          >
            + 숙소 추가
          </button>
        </div>
      </section>

      <section className="section">
        <h2>백업</h2>
        <div className="card">
          <button className="btn primary block" onClick={handleExport}>
            JSON 내보내기
          </button>
          <label className="btn block file-label">
            JSON 가져오기
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              hidden
            />
          </label>
          <p className="muted small">
            iOS Safari는 사용하지 않으면 데이터를 정리할 수 있어요. 정기적으로
            내보내기 해주세요.
          </p>
        </div>
      </section>

      <section className="section">
        <h2>위험 영역</h2>
        <div className="card">
          <button
            className="btn block"
            style={{ color: 'var(--neg)' }}
            onClick={handleClear}
          >
            모든 데이터 삭제
          </button>
        </div>
      </section>

      {editing && (
        <Modal
          title={editing === 'new' ? '숙소 추가' : '숙소 수정'}
          onClose={() => setEditing(null)}
        >
          <form className="form" onSubmit={saveProperty}>
            <label>
              이름
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="예: 강릉 1호점"
              />
            </label>
            <label>
              색상
              <div className="color-picker">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`color-swatch ${color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button type="submit" className="btn primary">
                저장
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
