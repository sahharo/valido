import { useState } from 'react'
import { Field, inputCls } from './ui.tsx'
import { maskCEP, maskCNPJ, onlyDigits, UFS } from '../../shared/validation.ts'
import type { StoreDraft } from '../storeDraft.ts'

// Form fields for one store, used in onboarding and in the profile "add store" form.

export function StoreFields({
  value, onChange, errors = {},
}: {
  value: StoreDraft
  onChange: (d: StoreDraft) => void
  errors?: Partial<Record<keyof StoreDraft, string>>
}) {
  const set = (k: keyof StoreDraft, v: string) => onChange({ ...value, [k]: v })
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle')

  // Typing a full CEP fills street/neighborhood, city and UF from ViaCEP (free, no key). The number is always typed.
  async function changeCep(raw: string) {
    const cep = maskCEP(raw)
    onChange({ ...value, cep })
    const digits = onlyDigits(cep)
    if (digits.length !== 8) return setCepStatus('idle')
    setCepStatus('loading')
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (!res.ok || data.erro) return setCepStatus('notfound')
      onChange({
        ...value,
        cep,
        address: [data.logradouro, data.bairro].filter(Boolean).join(', ') || value.address,
        city: data.localidade || value.city,
        uf: (UFS as readonly string[]).includes(data.uf) ? data.uf : value.uf,
      })
      setCepStatus('idle')
    } catch {
      setCepStatus('error')
    }
  }
  const cepHint = {
    idle: 'Digite o CEP para preencher o endereço.',
    loading: 'Buscando endereço…',
    notfound: 'CEP não encontrado. Preencha o endereço abaixo.',
    error: 'Não foi possível buscar o CEP agora. Preencha o endereço abaixo.',
  }[cepStatus]
  return (
    <div className="space-y-3">
      <Field label="Nome da loja *" error={errors.name}>
        <input className={inputCls} placeholder="Ex.: Loja Centro" value={value.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="CNPJ da loja *" error={errors.cnpj}>
        <input className={inputCls} inputMode="numeric" placeholder="00.000.000/0000-00" value={value.cnpj} onChange={(e) => set('cnpj', maskCNPJ(e.target.value))} />
      </Field>
      <Field label="CEP" hint={cepHint} error={errors.cep}>
        <input className={inputCls} inputMode="numeric" placeholder="00000-000" value={value.cep} onChange={(e) => changeCep(e.target.value)} autoComplete="postal-code" />
      </Field>
      {/* Address and street number are required and kept in separate fields. */}
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Endereço *" error={errors.address}>
          <input className={inputCls} placeholder="Rua, avenida, bairro" value={value.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Número *" error={errors.addressNumber}>
          <input className={inputCls} placeholder="Ex.: 120" value={value.addressNumber} onChange={(e) => set('addressNumber', e.target.value)} maxLength={20} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Cidade *" error={errors.city}>
          <input className={inputCls} placeholder="Ex.: Campinas" value={value.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="UF">
          <select className={inputCls} value={value.uf} onChange={(e) => set('uf', e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
      </div>
    </div>
  )
}
