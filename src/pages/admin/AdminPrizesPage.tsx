import { useEffect, useMemo, useState } from 'react';

import { listPrizes, replacePrizes, savePrize } from '../../db/adminRepository';
import { signalHuntDatabase, type SignalHuntDatabase } from '../../db/database';
import type { Prize } from '../../domain/draw/types';
import { parsePrizeImport, stringifyPrizeExport } from '../../features/admin/prizeImport';
import { AdminLayout } from './AdminLayout';

type AdminPrizesPageProps = {
  db?: SignalHuntDatabase;
};

type PrizeFormState = {
  id: string;
  name: string;
  shortName: string;
  level: string;
  inventoryTotal: string;
  inventoryRemaining: string;
  weight: string;
  enabled: boolean;
};

const defaultForm: PrizeFormState = {
  id: '',
  name: '',
  shortName: '',
  level: '1',
  inventoryTotal: '1',
  inventoryRemaining: '1',
  weight: '1',
  enabled: true,
};

export function AdminPrizesPage({ db = signalHuntDatabase }: AdminPrizesPageProps) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [form, setForm] = useState<PrizeFormState>(defaultForm);
  const [jsonText, setJsonText] = useState('[]');
  const [message, setMessage] = useState('');

  const exportText = useMemo(() => stringifyPrizeExport(prizes), [prizes]);

  const refresh = async (options: { syncJsonText: boolean }) => {
    const nextPrizes = await listPrizes(db);
    setPrizes(nextPrizes);
    if (options.syncJsonText) {
      setJsonText(stringifyPrizeExport(nextPrizes));
    }
  };

  useEffect(() => {
    let disposed = false;

    void listPrizes(db).then((nextPrizes) => {
      if (disposed) {
        return;
      }

      setPrizes(nextPrizes);
      setJsonText((currentText) => (currentText === '[]' ? stringifyPrizeExport(nextPrizes) : currentText));
    });

    return () => {
      disposed = true;
    };
  }, [db]);

  const handleSavePrize = async () => {
    const prize = createPrizeFromForm(form);
    await savePrize(db, prize);
    setMessage('奖品已保存。');
    setForm(defaultForm);
    await refresh({ syncJsonText: true });
  };

  const handleImport = async () => {
    const importedPrizes = parsePrizeImport(jsonText);
    await replacePrizes(db, importedPrizes);
    setMessage('奖品 JSON 已导入。');
    await refresh({ syncJsonText: true });
  };

  return (
    <AdminLayout title="奖品">
      <section className="admin-grid-two">
        <form className="admin-form" onSubmit={(event) => event.preventDefault()}>
          <h2>奖品编辑</h2>
          <label>
            编号
            <input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} />
          </label>
          <label>
            奖项名称
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            简称
            <input
              value={form.shortName}
              onChange={(event) => setForm({ ...form, shortName: event.target.value })}
            />
          </label>
          <div className="admin-form-row">
            <label>
              等级
              <input
                type="number"
                min="1"
                value={form.level}
                onChange={(event) => setForm({ ...form, level: event.target.value })}
              />
            </label>
            <label>
              权重
              <input
                type="number"
                min="0"
                value={form.weight}
                onChange={(event) => setForm({ ...form, weight: event.target.value })}
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              总量
              <input
                type="number"
                min="0"
                value={form.inventoryTotal}
                onChange={(event) => setForm({ ...form, inventoryTotal: event.target.value })}
              />
            </label>
            <label>
              剩余
              <input
                type="number"
                min="0"
                value={form.inventoryRemaining}
                onChange={(event) => setForm({ ...form, inventoryRemaining: event.target.value })}
              />
            </label>
          </div>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            />
            启用
          </label>
          <button className="admin-button" type="button" onClick={handleSavePrize}>
            保存奖品
          </button>
        </form>

        <section className="admin-form">
          <h2>JSON 导入 / 导出</h2>
          <label>
            奖品 JSON
            <textarea value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={12} />
          </label>
          <div className="admin-actions">
            <button className="admin-button" type="button" onClick={handleImport}>
              导入 JSON
            </button>
            <button className="admin-button secondary" type="button" onClick={() => setJsonText(exportText)}>
              刷新导出
            </button>
          </div>
          {message ? <p className="admin-message">{message}</p> : null}
        </section>
      </section>

      <section className="admin-table-wrap">
        <h2>奖品列表</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>奖项</th>
              <th>等级</th>
              <th>剩余</th>
              <th>权重</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((prize) => (
              <tr key={prize.id}>
                <td>{prize.name}</td>
                <td>{prize.level}</td>
                <td>
                  {prize.inventoryRemaining} / {prize.inventoryTotal}
                </td>
                <td>{prize.weight}</td>
                <td>{prize.enabled ? '启用' : '停用'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminLayout>
  );
}

function createPrizeFromForm(form: PrizeFormState): Prize {
  const id = form.id.trim() || `prize-${crypto.randomUUID()}`;
  const name = form.name.trim();
  const shortName = form.shortName.trim() || name;

  if (!name) {
    throw new Error('请填写奖项名称。');
  }

  return {
    id,
    name,
    shortName,
    level: Number(form.level),
    inventoryTotal: Number(form.inventoryTotal),
    inventoryRemaining: Number(form.inventoryRemaining),
    weight: Number(form.weight),
    enabled: form.enabled,
  };
}
