export const demoBills = [
  {
    id: 'demo-uvv', title: 'Mensalidade UVV', category: 'Educação', amount: 1982.70,
    nominalAmount: 2203, dueDate: '2026-12-05', documentExpectedAt: '2026-11-20',
    discountUntil: '2026-12-01', payerName: 'Sophia', sourceChannel: 'Gmail',
    sender: 'financeiro@uvv.br', locatorHint: 'Assunto contém “mensalidade” e nome da aluna',
    paymentMethod: 'Boleto', bankAccount: 'Nubank', status: 'document_found',
    barcode: '23793.51105 20000.694834 68000.155207 9 16510000220300', recurring: true,
  },
  {
    id: 'demo-energy', title: 'Energia — apartamento', category: 'Moradia', amount: 286.40,
    nominalAmount: 286.40, dueDate: '2026-08-28', documentExpectedAt: '2026-08-18',
    discountUntil: null, payerName: 'Carlos', sourceChannel: 'Gmail',
    sender: 'conta@edp.com.br', locatorHint: 'Remetente EDP + unidade consumidora',
    paymentMethod: 'Débito automático', bankAccount: 'Nubank', status: 'scheduled', barcode: '', recurring: true,
  },
  {
    id: 'demo-phone', title: 'Telefone celular', category: 'Comunicação', amount: 119.90,
    nominalAmount: 119.90, dueDate: '2026-08-30', documentExpectedAt: '2026-08-20',
    discountUntil: null, payerName: 'Carlos', sourceChannel: 'WhatsApp',
    sender: '+55 27 9••••-1100', locatorHint: 'Mensagem da operadora com PDF anexo',
    paymentMethod: 'Débito automático', bankAccount: 'Nubank', status: 'waiting_document', barcode: '', recurring: true,
  },
  {
    id: 'demo-condo', title: 'Condomínio', category: 'Moradia', amount: 850,
    nominalAmount: 850, dueDate: '2026-09-05', documentExpectedAt: '2026-08-25',
    discountUntil: null, payerName: 'Carlos', sourceChannel: 'Portal',
    sender: 'Administradora Praia do Suá', locatorHint: 'Portal do morador · unidade 903',
    paymentMethod: 'Boleto', bankAccount: 'CAIXA', status: 'waiting_document', barcode: '', recurring: true,
  },
]
